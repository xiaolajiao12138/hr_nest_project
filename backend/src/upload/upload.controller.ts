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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * 单文件上传（需要 JWT 登录认证）
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
   * 文件流预览/下载代理
   */
  @Get('preview/:folder/:fileName')
  async previewFile(
    @Param('folder') folder: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const filePath = `${folder}/${fileName}`;
    const stream = await this.uploadService.getFileStream(filePath);
    stream.pipe(res);
  }

  /**
   * 获取预签名访问链接
   */
  @Get('presigned-url/:fileId')
  @UseGuards(JwtAuthGuard)
  async getPresigned(@Param('fileId') fileId: number) {
    const file = await this.uploadService['fileRepository'].findOne({
      where: { id: fileId },
    });
    if (!file) return { url: '' };
    const url = await this.uploadService.getPresignedUrl(file.filePath);
    return { url };
  }

  /**
   * 删除文件
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Param('id') id: number) {
    return this.uploadService.deleteFile(id);
  }
}
