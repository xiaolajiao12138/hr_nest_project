/**
 * 全局统一北京时间 (UTC+8) 处理与格式化工具库
 */

/**
 * 格式化为标准北京时间完整格式: YYYY-MM-DD HH:mm:ss
 * 读取本地/东八区时间，杜绝使用 toISOString 导致的 -8 小时漂移问题
 */
export function formatDateTime(val?: string | number | Date | null): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');

  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/**
 * 格式化为标准时间格式: HH:mm (例如 09:00, 16:08)
 */
export function formatTimeHM(val?: string | number | Date | null): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '-';

  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * 格式化为标准日期格式: YYYY-MM-DD
 */
export function formatDateYMD(val?: string | number | Date | null): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化为年月格式: YYYY-MM
 */
export function formatYearMonth(val?: string | number | Date | null): string {
  const d = val ? new Date(val) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 转换为时间戳毫秒数
 */
export function toTimestamp(val?: string | number | Date | null): number {
  if (!val) return 0;
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
