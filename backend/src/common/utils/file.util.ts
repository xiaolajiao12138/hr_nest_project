import * as path from 'path';

/**
 * 文件处理通用工具类
 */
export class FileUtil {
  /**
   * 校验文件扩展名是否在安全允许列表中
   */
  static isAllowedExtension(fileName: string, allowedExts: string[]): boolean {
    const ext = this.getExtension(fileName).toLowerCase();
    return allowedExts.map((e) => e.toLowerCase()).includes(ext);
  }

  /**
   * 获取文件后缀名（包含点，如 .png）
   */
  static getExtension(fileName: string): string {
    return path.extname(fileName) || '';
  }

  /**
   * 格式化文件尺寸大小
   */
  static formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
