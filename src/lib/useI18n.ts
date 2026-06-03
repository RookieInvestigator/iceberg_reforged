import { useStore } from '@nanostores/vue';
import { lang } from './i18nStore';
import zh from './i18n/zh';
import en from './i18n/en';
import ja from './i18n/ja';

const dicts: Record<string, Record<string, string>> = { zh, en, ja };

export function useI18n() {
  const currentLang = useStore(lang);
  // t() 访问 currentLang.value，Vue 自动追踪依赖
  function t(key: string): string {
    return dicts[currentLang.value]?.[key] || (zh as Record<string, string>)[key] || key;
  }
  return { t, lang: currentLang, setLang: (l: string) => lang.set(l) };
}
