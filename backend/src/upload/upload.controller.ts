import {
  Controller, ForbiddenException,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Get,
  Param,
  Res,
  Query,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import * as path from 'path';

/**
 * 文件存储与多媒体上传控制器
 * 提供单文件安全上传、流式预览与图片代理输出、MinIO 临时预签名安全直链获取以及文件物理删除接口
 */
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * 单文件安全上传（需要 JWT 鉴权）
   * 自动计算 MD5 防重，对接 MinIO 对象存储；当 MinIO 离线时自动平稳降级至本地持久化目录
   *
   * @param file 通过 multipart/form-data 方式提交的文件对象
   * @param folder 自定义分类目录（如 employee、notice 等），缺省为 common
   * @returns 返回包含文件主键 ID、URL、文件名与大小的实体对象
   */
  @Post('file')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async uploadSingle(@CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.uploadService.uploadFile(file, folder || 'common', user);
  }

  /**
   * 文件流式代理预览与下载
   * 自动识别图片/PDF文件后缀并设置准确的 HTTP Content-Type Header
   *
   * @param folder 存储二级目录
   * @param fileName 存储文件名（含哈希与后缀）
   * @param res Express HTTP 响应管道
   */
  @Get('preview/:folder/:fileName')
  async previewFile(
    @Param('folder') folder: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
    @Query('fileId', ParseIntPipe) fileId: number,
    @Query('userId', ParseIntPipe) userId: number,
    @Query('expires', ParseIntPipe) expires: number,
    @Query('signature') signature: string,
  ) {
    const filePath = `${folder}/${fileName}`;
    const stream = await this.uploadService.verifyPreview(filePath, fileId, userId, expires, signature);
    const ext = (path.extname(fileName) || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',

      '.pdf': 'application/pdf',
    };
    if (mimeMap[ext]) {
      res.setHeader('Content-Type', mimeMap[ext]);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (!mimeMap[ext]) res.setHeader('Content-Disposition', 'attachment');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /**
   * 获取 MinIO 临时预签名访问直链 (Presigned URL)
   *
   * @param fileId 文件记录主键 ID
   * @returns 返回短期有效的可直接访问地址 { url: string }
   */
  /**
   * 公开只读用户头像静态直链输出（支持浏览器一年期 immutable 永久强缓存，兼容存量数字 fileId）
   */
  @Get('avatar/:target')
  async avatar(@Param('target') target: string, @Res() res: Response) {
    const { stream, mimeType } = await this.uploadService.resolvePublicAvatarStream(target);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get('presigned-url/:fileId')
  @UseGuards(JwtAuthGuard)
  async getPresigned(@CurrentUser() user: CurrentUserPayload, @Param('fileId', ParseIntPipe) fileId: number) {
    return { url: await this.uploadService.getPresignedUrl(fileId, user) };
  }

  /**
   * 删除文件（同时清理 MinIO 或本地磁盘物理文件与数据库引用元数据）
   *
   * @param id 文件记录主键 ID
   * @returns 返回操作结果布尔值
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.uploadService.deleteFile(id, user);
  }
}
