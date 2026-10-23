import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * 企业级 RSA 非对称加密与解密核心服务
 * 基于 Node.js 原生 crypto 模块，提供 2048 位密钥生成、公钥输出与私钥解密
 */
@Injectable()
export class RsaService {
  private readonly logger = new Logger(RsaService.name);
  private publicKey: string;
  private privateKey: string;

  constructor() {
    this.initKeys();
  }

  /**
   * 初始化生成 2048 位标准 RSA 密钥对
   */
  private initKeys() {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      this.publicKey = publicKey;
      this.privateKey = privateKey;
      this.logger.log('RSA 2048位安全密钥对已成功就绪');
    } catch (err) {
      this.logger.error('初始化 RSA 密钥对异常:', err);
    }
  }

  /**
   * 获取供前端加密使用的 RSA 公钥 (PEM 格式)
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * 使用私钥对前端提交的 Base64 密文进行解密
   * 若非有效 RSA 密文（如老版本客户端直接传递明文密码），则自动降级兼容返回原文
   *
   * @param cipherText Base64 编码的加密字符串
   * @returns 解密后的明文字符串
   */
  decrypt(cipherText?: string | null): string {
    if (!cipherText) return '';

    try {
      // 快速判断是否为合法的 Base64 长度结构
      const buffer = Buffer.from(cipherText, 'base64');
      if (buffer.length === 0) return cipherText;

      const decrypted = crypto.privateDecrypt(
        {
          key: this.privateKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        buffer
      );

      return decrypted.toString('utf8');
    } catch (error) {
      // 若解密失败（如输入本身即为明文，或者非该公钥加密），降级回退原始入参
      return cipherText;
    }
  }
}
