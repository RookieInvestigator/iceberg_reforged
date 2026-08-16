import { storedAtom } from './settingsStore';
import zh from './i18n/zh';
import en from './i18n/en';
import ja from './i18n/ja';

export const lang = storedAtom('iceberg-lang', 'zh');

// P1-3：html lang 跟随界面语言切换（SEO 与读屏语言识别）
const LANG_ATTR: Record<string, string> = { zh: 'zh-CN', en: 'en', ja: 'ja' };
function syncDocumentLang(value: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANG_ATTR[value] || value;
  }
}
syncDocumentLang(lang.get());
lang.listen((value) => syncDocumentLang(value));

const dicts: Record<string, Record<string, string>> = { zh, en, ja };

export function t(key: string): string {
  return dicts[lang.get()]?.[key] || dicts['zh']?.[key] || key;
}
