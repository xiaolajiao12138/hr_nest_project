/**
 * 系统 RGB 调色板与 Element Plus 主题衍生梯度算法引擎
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * 将 16 进制颜色字符串转为 RGB 数值对象
 * 支持 #fff / #ffffff 格式
 */
export function hexToRgb(hex: string): RgbColor | null {
  let cleanHex = hex.trim().replace(/^#/, '');

  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (cleanHex.length !== 6) {
    return null;
  }

  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
    return null;
  }

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * 将 RGB 3通道数值格式化为标准 16 进制颜色字符串 (#rrggbb)
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const toHex = (val: number) => clamp(val).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 色彩线性混合算法
 * 计算公式: C = round(c1 * (1 - weight) + c2 * weight)
 * @param color1 基础色 (Hex)
 * @param color2 目标混合色 (Hex)
 * @param weight 混合权重 (0 ~ 1)
 */
export function mixColor(color1: string, color2: string, weight: number): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) {
    return color1;
  }

  const w = Math.max(0, Math.min(1, weight));
  const r = rgb1.r * (1 - w) + rgb2.r * w;
  const g = rgb1.g * (1 - w) + rgb2.g * w;
  const b = rgb1.b * (1 - w) + rgb2.b * w;

  return rgbToHex(r, g, b);
}

/**
 * 根据主色生成 Element Plus 全套色阶变量键值对
 * 浅色梯度: 主色与纯白 #ffffff 混合 (权重 0.1 ~ 0.9)
 * 深色态: 主色与纯黑 #000000 混合 (权重 0.2)
 */
export function generateThemeColors(primary: string): Record<string, string> {
  const validPrimary = hexToRgb(primary) ? primary : '#409eff';
  const colors: Record<string, string> = {
    '--el-color-primary': validPrimary,
  };

  // 生成 light-1 到 light-9
  for (let i = 1; i <= 9; i++) {
    const weight = i * 0.1;
    colors[`--el-color-primary-light-${i}`] = mixColor(validPrimary, '#ffffff', weight);
  }

  // 生成深色状态 dark-2 (常用于 active / hover 阴影)
  colors['--el-color-primary-dark-2'] = mixColor(validPrimary, '#000000', 0.2);

  return colors;
}

/**
 * 动态将主题色变量写入 document.documentElement
 */
export function applyTheme(primary: string): void {
  if (typeof document === 'undefined') return;

  const colors = generateThemeColors(primary);
  const el = document.documentElement;

  for (const [key, value] of Object.entries(colors)) {
    el.style.setProperty(key, value);
  }
}
