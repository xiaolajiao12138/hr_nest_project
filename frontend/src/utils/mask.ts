/**
 * 企业级敏感数据脱敏工具函数库
 */

export type SensitiveType = 'phone' | 'idCard' | 'email' | 'name' | 'bankCard' | 'custom';

/**
 * 通用字符串遮罩处理
 * 保留前 prefixLen 位和后 suffixLen 位，中间替换为 maskChar (默认 *)
 */
export function maskCommon(
  val?: string | null,
  prefixLen = 3,
  suffixLen = 4,
  maskChar = '*'
): string {
  if (!val) return '-';
  const str = String(val).trim();
  const len = str.length;

  if (len <= prefixLen + suffixLen) {
    return str;
  }

  const prefix = str.slice(0, prefixLen);
  const suffix = str.slice(len - suffixLen);
  const maskPart = maskChar.repeat(Math.max(1, len - prefixLen - suffixLen));

  return `${prefix}${maskPart}${suffix}`;
}

/**
 * 手机号脱敏
 * 示例: 13812345678 -> 138****5678
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '-';
  const str = String(phone).trim();
  if (str.length === 11) {
    return str.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }
  return maskCommon(str, 3, 4);
}

/**
 * 身份证号脱敏
 * 18位身份证保留前6位行政区划和后4位校验码，中间8位出生日期星号隐藏
 * 示例: 110101199003072345 -> 110101********2345
 */
export function maskIdCard(idCard?: string | null): string {
  if (!idCard) return '-';
  const str = String(idCard).trim();
  if (str.length === 18) {
    return str.replace(/^(\d{6})\d{8}(\w{4})$/, '$1********$2');
  }
  return maskCommon(str, 4, 4);
}

/**
 * 电子邮箱脱敏
 * 示例: zhangsan123@example.com -> z***3@example.com
 */
export function maskEmail(email?: string | null): string {
  if (!email) return '-';
  const str = String(email).trim();
  const atIndex = str.indexOf('@');
  if (atIndex <= 1) return str;

  const username = str.slice(0, atIndex);
  const domain = str.slice(atIndex);

  let maskedUser = username;
  if (username.length <= 2) {
    maskedUser = username[0] + '*';
  } else {
    maskedUser = `${username[0]}***${username[username.length - 1]}`;
  }

  return `${maskedUser}${domain}`;
}

/**
 * 姓名脱敏
 * 示例: 李四 -> 李* / 诸葛孔明 -> 诸**明
 */
export function maskName(name?: string | null): string {
  if (!name) return '-';
  const str = String(name).trim();
  if (str.length <= 1) return str;
  if (str.length === 2) return `${str[0]}*`;
  return `${str[0]}${'*'.repeat(str.length - 2)}${str[str.length - 1]}`;
}

/**
 * 银行卡号脱敏
 * 保留前4位和后4位
 */
export function maskBankCard(card?: string | null): string {
  if (!card) return '-';
  return maskCommon(card, 4, 4);
}

/**
 * 统一脱敏分发函数
 */
export function formatSensitive(val?: string | null, type: SensitiveType = 'custom'): string {
  if (!val) return '-';

  switch (type) {
    case 'phone':
      return maskPhone(val);
    case 'idCard':
      return maskIdCard(val);
    case 'email':
      return maskEmail(val);
    case 'name':
      return maskName(val);
    case 'bankCard':
      return maskBankCard(val);
    case 'custom':
    default:
      return maskCommon(val);
  }
}
