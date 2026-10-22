/**
 * 企业级数据脱敏工具
 */
export class DesensitizeUtil {
  /**
   * 手机号脱敏：保留前3后4位，例如 138****1234
   */
  static phone(phone: string): string {
    if (!phone || phone.length < 7) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }

  /**
   * 身份证脱敏：保留前6后4位，中间隐藏，例如 110101********2331
   */
  static idCard(idCard: string): string {
    if (!idCard || idCard.length < 10) return idCard;
    return idCard.replace(/(\d{6})\d+(\w{4})/, '$1********$2');
  }

  /**
   * 中文姓名脱敏：两个字脱敏后一个字（张*），三个字及以上脱敏中间（李*华、欧阳**强）
   */
  static chineseName(name: string): string {
    if (!name) return name;
    if (name.length <= 1) return name;
    if (name.length === 2) return name.charAt(0) + '*';
    return name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
  }

  /**
   * 薪资脱敏，非HR权限显示 ***
   */
  static salary(salary: number | string): string {
    return '***';
  }
}
