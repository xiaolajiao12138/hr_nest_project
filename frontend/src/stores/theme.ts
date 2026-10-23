import { defineStore } from 'pinia';
import { ref } from 'vue';
import { applyTheme } from '@/utils/theme';

export const DEFAULT_THEME_COLOR = '#409eff';

export const PRESET_THEME_COLORS = [
  '#409eff', // 经典蓝
  '#10b981', // 翡翠绿
  '#8b5cf6', // 优雅紫
  '#f97316', // 活力橙
  '#e11d48', // 玫瑰红
  '#06b6d4', // 科技青
];

export const useThemeStore = defineStore('theme', () => {
  const savedColor = localStorage.getItem('app-theme-color');
  const primaryColor = ref<string>(savedColor || DEFAULT_THEME_COLOR);

  /**
   * 设置新主题色并即时应用与持久化
   */
  const setPrimaryColor = (color: string) => {
    if (!color) return;
    primaryColor.value = color;
    localStorage.setItem('app-theme-color', color);
    applyTheme(color);
  };

  /**
   * 系统初始化时应用主题色
   */
  const initTheme = () => {
    applyTheme(primaryColor.value);
  };

  /**
   * 恢复默认经典蓝主题
   */
  const resetTheme = () => {
    setPrimaryColor(DEFAULT_THEME_COLOR);
  };

  return {
    primaryColor,
    setPrimaryColor,
    initTheme,
    resetTheme,
    presetColors: PRESET_THEME_COLORS,
  };
});
