import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Get,
  Param,
  Res,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Response } from 'express';
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.uploadService.uploadFile(file, folder || 'common');
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
  ) {
    const filePath = `${folder}/${fileName}`;
    const stream = await this.uploadService.getFileStream(filePath);
    const ext = (path.extname(fileName) || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };
    if (mimeMap[ext]) {
      res.setHeader('Content-Type', mimeMap[ext]);
    }
    stream.pipe(res);
  }

  /**
   * 获取 MinIO 临时预签名访问直链 (Presigned URL)
   *
   * @param fileId 文件记录主键 ID
   * @returns 返回短期有效的可直接访问地址 { url: string }
   */
  @Get('presigned-url/:fileId')
  @UseGuards(JwtAuthGuard)
  async getPresigned(@Param('fileId', ParseIntPipe) fileId: number) {
    const file = await this.uploadService['fileRepository'].findOne({
      where: { id: fileId },
    });
    if (!file) return { url: '' };
    const url = await this.uploadService.getPresignedUrl(file.filePath);
    return { url };
  }

  /**
   * 删除文件（同时清理 MinIO 或本地磁盘物理文件与数据库引用元数据）
   *
   * @param id 文件记录主键 ID
   * @returns 返回操作结果布尔值
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.uploadService.deleteFile(id);
  }
}
