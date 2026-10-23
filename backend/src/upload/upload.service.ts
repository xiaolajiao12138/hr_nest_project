import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Minio from 'minio';
import { SysFile } from './entities/file.entity';
import { BusinessException } from '../common/exceptions/business.exception';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * 文件对象存储与高可用降级上传服务类
 * 
 * 核心架构特性：
 * 1. 对象存储 MinIO 多环境隔离：Local (hr-local-files) / Test (hr-test-files) / Prod (hr-prod-files)；
 * 2. 高可用自动降级：当 MinIO 节点离线或网络不可达时，自动无缝平稳降级为服务器本地磁盘存储，业务不中断；
 * 3. 严格安全审计：防御式检测可执行脚本黑名单（.exe, .bat, .sh, .php, .jsp 等），限制 20MB 单文件上限；
 * 4. 防碰撞哈希：使用时间戳 + 6字节随机加盐生成唯一文件名，防止重名文件被覆盖；
 * 5. 安全预签名：支持 MinIO 原生预签名（Presigned URL）与流式安全反向代理预览。
 */
@Injectable()
export class UploadService implements OnModuleInit {
  /** 日志记录器 */
  private readonly logger = new Logger(UploadService.name);
  /** MinIO 客户端实例 */
  private minioClient: Minio.Client;
  /** 当前环境对应的隔离存储桶名称 */
  private bucketName: string;
  /** 本地磁盘降级存储绝对路径目录 */
  private readonly localUploadDir = path.join(process.cwd(), 'uploads');

  /** 危险文件扩展名拦截黑名单 */
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

  /** 允许的最大文件字节大小 (20MB) */
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024;

  /**
   * 构造函数初始化 MinIO 客户端
   * 
   * @param configService 全局配置服务
   * @param fileRepository 文件元数据实体仓储
   */
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

  /**
   * 模块初始化生命周期：检测 MinIO 桶可用性并按需自动建桶
   */
  async onModuleInit() {
    try {
      // 检查当前环境隔离的桶是否存在，不存在则创建
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`成功自动初始化 MinIO 桶: ${this.bucketName}`);
      }
    } catch (error) {
      this.logger.warn(`MinIO 连接初始化提示: 未检测到运行中的 MinIO (${error.message})，文件存储将自动平稳降级为本地磁盘存储`);
    }
  }

  /**
   * 上传文件（双模高可用：优先 MinIO，失败自动降级本地磁盘）
   * 
   * @param file Multer 解析后的单文件对象
   * @param folder 自定义业务分类子目录，如 avatar (头像), notice (公告附件), idcard (证件)
   * @returns 持久化成功的文件元数据记录实体 SysFile
   * @throws BusinessException 当文件为空、超大、格式非法或磁盘写入异常时抛出
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'common',
  ): Promise<SysFile> {
    if (!file) {
      throw new BusinessException('上传文件不能为空');
    }

    // 单文件体积安全约束
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BusinessException('上传文件过大，单文件限制在 20MB 以内');
    }

    // 后缀名黑名单安全拦截
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (this.dangerousExtensions.includes(ext)) {
      throw new BusinessException(`安全拦截：禁止上传 ${ext} 格式的可执行或脚本文件`);
    }

    // 时间戳 + 随机字节组合哈希，杜绝重名覆盖风险
    const randomName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const objectPath = `${folder}/${randomName}`;

    // 优先尝试上传 MinIO，若 MinIO 离线/连接失败则自动降级存储至本地磁盘
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
      this.logger.warn(`MinIO 上传不可用 (${err.message})，自动平稳降级保存至本地磁盘`);
      try {
        const targetDir = path.join(this.localUploadDir, folder);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const localFilePath = path.join(targetDir, randomName);
        await fs.promises.writeFile(localFilePath, file.buffer);
      } catch (localErr) {
        this.logger.error(`本地磁盘写入失败: ${localErr.message}`);
        throw new BusinessException(`文件持久化失败: ${localErr.message}`);
      }
    }

    // 访问路径 (通过后端统一中转代理预览)
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
   * 生成 MinIO 对象的临时安全预签名访问 URL
   * 
   * @param filePath 桶内相对对象路径
   * @param expirySeconds 签名有效期（默认 3600 秒 = 1 小时）
   * @returns 携带临时安全签名的完整 URL
   */
  async getPresignedUrl(filePath: string, expirySeconds = 3600): Promise<string> {
    try {
      return await this.minioClient.presignedGetObject(
        this.bucketName,
        filePath,
        expirySeconds,
      );
    } catch (err) {
      // MinIO 不可用时降级返回本地中转预览 URL
      return `/api/upload/preview/${filePath}`;
    }
  }

  /**
   * 获取文件读取流（用于图片在线流式渲染或大附件边读边下）
   * 
   * @param filePath 存储路径
   * @returns NodeJS Readable 读取流
   * @throws BusinessException 文件读取失败时抛出
   */
  async getFileStream(filePath: string) {
    // 优先检查本地磁盘是否存在降级存储的文件
    const localFilePath = path.join(this.localUploadDir, filePath);
    if (fs.existsSync(localFilePath)) {
      return fs.createReadStream(localFilePath);
    }

    // 若本地没有，尝试从 MinIO 获取
    try {
      return await this.minioClient.getObject(this.bucketName, filePath);
    } catch (err) {
      throw new BusinessException(`读取存储文件流失败: ${err.message}`);
    }
  }

  /**
   * 物理级联删除文件（同步清理本地磁盘副本与 MinIO 对象）
   * 
   * @param id 附件记录 ID
   * @returns 删除是否成功
   * @throws BusinessException 文件不存在时抛出
   */
  async deleteFile(id: number): Promise<boolean> {
    const fileRecord = await this.fileRepository.findOne({ where: { id } });
    if (!fileRecord) {
      throw new BusinessException('待删除的文件记录不存在');
    }

    // 清理本地降级存储的文件
    const localFilePath = path.join(this.localUploadDir, fileRecord.filePath);
    if (fs.existsSync(localFilePath)) {
      try {
        await fs.promises.unlink(localFilePath);
      } catch (err) {
        this.logger.warn(`本地文件删除失败: ${err.message}`);
      }
    }

    // 尝试清理 MinIO
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
