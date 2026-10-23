import JSEncrypt from 'jsencrypt';
import { getRsaPublicKeyApi } from '@/api/auth';

let cachedPublicKey: string | null = null;

/**
 * 获取或刷新 RSA 公钥
 */
export async function getRsaPublicKey(): Promise<string | null> {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  try {
    const res: any = await getRsaPublicKeyApi();
    if (res && res.publicKey) {
      cachedPublicKey = res.publicKey;
      return cachedPublicKey;
    }
  } catch (error) {
    console.warn('获取 RSA 公钥失败，将降级使用原始传输:', error);
  }

  return null;
}

/**
 * 使用 RSA 公钥加密明文字符串
 * 优先采用后端下发的 2048 位公钥，若公钥不可用则优雅降级为明文，杜绝阻断登录流程
 *
 * @param plainText 待加密明文
 * @returns Base64 编码的密文字符串
 */
export async function encryptRsa(plainText: string): Promise<string> {
  if (!plainText) return '';

  const publicKey = await getRsaPublicKey();
  if (!publicKey) {
    return plainText;
  }

  try {
    const encryptor = new JSEncrypt();
    encryptor.setPublicKey(publicKey);
    const encrypted = encryptor.encrypt(plainText);
    return encrypted || plainText;
  } catch (err) {
    console.warn('RSA 加密计算异常，自动回退原文:', err);
    return plainText;
  }
}
