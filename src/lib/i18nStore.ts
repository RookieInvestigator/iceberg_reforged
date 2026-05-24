import { storedAtom } from './settingsStore';
import zh from './i18n/zh';
import en from './i18n/en';
import ja from './i18n/ja';

export const lang = storedAtom('iceberg-lang', 'zh');

const dicts: Record<string, Record<string, string>> = { zh, en, ja };

export function t(key: string): string {
  return dicts[lang.get()]?.[key] || dicts['zh']?.[key] || key;
}
