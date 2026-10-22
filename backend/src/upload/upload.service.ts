import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Minio from 'minio';
import { SysFile } from './entities/file.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private minioClient: Minio.Client;
  private bucketName: string;

  // 危险文件扩展名黑名单
  private readonly dangerousExtensions = [
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.php',
    '.asp',
    '.aspx',
    '.jsp',
    '.jar',
    '.vbs',
    '.ps1',
  ];

  // 允许的最大文件大小 20MB
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SysFile)
    private readonly fileRepository: Repository<SysFile>,
  ) {
    const minioConf = this.configService.get('minio');
    this.bucketName = minioConf.bucketName;

    this.minioClient = new Minio.Client({
      endPoint: minioConf.endPoint,
      port: minioConf.port,
      useSSL: minioConf.useSSL,
      accessKey: minioConf.accessKey,
      secretKey: minioConf.secretKey,
    });
  }

  async onModuleInit() {
    try {
      // 检查当前环境隔离的桶是否存在，不存在则创建
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`成功自动初始化 MinIO 桶: ${this.bucketName}`);
      }
    } catch (error) {
      this.logger.warn(`MinIO 连接初始化警告: ${error.message}`);
    }
  }

  /**
   * 上传单文件
   * @param file Express.Multer.File
   * @param folder 自定义目录，如 avatar, idcard, cert
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'common',
  ): Promise<SysFile> {
    if (!file) {
      throw new BusinessException('上传文件不能为空');
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new BusinessException('上传文件过大，单文件限制在 20MB 以内');
    }

    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (this.dangerousExtensions.includes(ext)) {
      throw new BusinessException(`安全拦截：禁止上传 ${ext} 格式的可执行或脚本文件`);
    }

    // 生成随机唯一文件名，避免重名覆盖
    const randomName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const objectPath = `${folder}/${randomName}`;

    try {
      await this.minioClient.putObject(
        this.bucketName,
        objectPath,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
        },
      );
    } catch (err) {
      this.logger.error(`MinIO 文件上传失败: ${err.message}`);
      throw new BusinessException(`对象存储上传异常: ${err.message}`);
    }

    // 访问路径 (在生产环境或本地走后端中转预览或预签名URL)
    const fileUrl = `/api/upload/preview/${folder}/${randomName}`;

    // 保存至数据库 sys_file
    const sysFile = this.fileRepository.create({
      originalName: file.originalname,
      fileName: randomName,
      fileSize: file.size,
      fileExt: ext,
      mimeType: file.mimetype,
      bucketName: this.bucketName,
      filePath: objectPath,
      fileUrl,
    });

    return this.fileRepository.save(sysFile);
  }

  /**
   * 获取预签名访问 URL（支持带过期时间）
   */
  async getPresignedUrl(filePath: string, expirySeconds = 3600): Promise<string> {
    try {
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        filePath,
        expirySeconds,
      );
    } catch (err) {
      throw new BusinessException(`获取临时预览链接失败: ${err.message}`);
    }
  }

  /**
   * 获取文件读取流（用于前端直接在浏览器预览或下载图片/PDF）
   */
  async getFileStream(filePath: string) {
    try {
      return await this.minioClient.getObject(this.bucketName, filePath);
    } catch (err) {
      throw new BusinessException(`读取对象存储流失败: ${err.message}`);
    }
  }

  /**
   * 根据 ID 删除文件
   */
  async deleteFile(id: number): Promise<boolean> {
    const fileRecord = await this.fileRepository.findOne({ where: { id } });
    if (!fileRecord) {
      throw new BusinessException('待删除的文件记录不存在');
    }

    try {
      await this.minioClient.removeObject(
        fileRecord.bucketName,
        fileRecord.filePath,
      );
    } catch (err) {
      this.logger.warn(`MinIO 删除对象失败: ${err.message}`);
    }

    await this.fileRepository.delete(id);
    return true;
  }
}
