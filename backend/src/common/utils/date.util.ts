/**
 * 日期格式化与计算工具类
 */
export class DateUtil {
  /**
   * 格式化日期为 YYYY-MM-DD HH:mm:ss 或自定义格式
   */
  static format(date: Date | string | number = new Date(), format = 'YYYY-MM-DD HH:mm:ss'): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  static formatDate(date: Date | string | number = new Date()): string {
    return this.format(date, 'YYYY-MM-DD');
  }

  /**
   * 计算两个日期相差的天数
   */
  static diffDays(start: Date | string, end: Date | string): number {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  }
}
