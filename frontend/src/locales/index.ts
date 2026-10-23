import { ref, computed } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import ja from 'element-plus/es/locale/lang/ja';

import zhCNLocale from './zh-CN';
import enUSLocale from './en-US';
import jaJPLocale from './ja-JP';

export type SupportedLocale = 'zh-CN' | 'en-US' | 'ja-JP';

export interface LocaleOption {
  key: SupportedLocale;
  label: string;
  flag: string;
}

export const AVAILABLE_LOCALES: LocaleOption[] = [
  { key: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { key: 'en-US', label: 'English', flag: '🇺🇸' },
  { key: 'ja-JP', label: '日本語', flag: '🇯🇵' },
];

const messageDicts: Record<SupportedLocale, any> = {
  'zh-CN': zhCNLocale,
  'en-US': enUSLocale,
  'ja-JP': jaJPLocale,
};

const elementLocaleDicts: Record<SupportedLocale, any> = {
  'zh-CN': zhCn,
  'en-US': en,
  'ja-JP': ja,
};

// 全局单例响应式状态
const savedLocale = (localStorage.getItem('app-locale') as SupportedLocale) || 'zh-CN';
const currentLocale = ref<SupportedLocale>(
  ['zh-CN', 'en-US', 'ja-JP'].includes(savedLocale) ? savedLocale : 'zh-CN'
);

export function useI18n() {
  const setLocale = (lang: SupportedLocale) => {
    if (!messageDicts[lang]) return;
    currentLocale.value = lang;
    localStorage.setItem('app-locale', lang);
  };

  /**
   * 国际化取值函数
   * 格式: t('dashboard.totalEmployees')
   */
  const t = (path: string, params?: Record<string, string | number>): string => {
    const keys = path.split('.');
    let val: any = messageDicts[currentLocale.value];

    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        // 回退到中文
        val = null;
        break;
      }
    }

    if (val === null) {
      let fallback: any = messageDicts['zh-CN'];
      for (const k of keys) {
        if (fallback && typeof fallback === 'object' && k in fallback) {
          fallback = fallback[k];
        } else {
          return path;
        }
      }
      val = fallback;
    }

    if (typeof val !== 'string') {
      return path;
    }

    if (params) {
      return val.replace(/\{(\w+)\}/g, (_, key) => {
        return params[key] !== undefined ? String(params[key]) : `{${key}}`;
      });
    }

    return val;
  };

  // Element Plus 语言包响应式绑定
  const elementLocale = computed(() => elementLocaleDicts[currentLocale.value] || zhCn);

  return {
    locale: currentLocale,
    setLocale,
    t,
    elementLocale,
    availableLocales: AVAILABLE_LOCALES,
  };
}
