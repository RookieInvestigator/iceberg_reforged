const BASE = (typeof window !== 'undefined' && (window as any).BASE_URL) || '';

export function url(path: string): string {
  return BASE + path;
}
