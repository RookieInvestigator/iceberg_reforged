// tags 归一化（payload 边界用）：数组直接过滤；字符串兼容 JSON 数组或分隔符写法。
// 历史债收敛到此一处，展示组件只收 string[]。
export function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean)
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      // 非 JSON，按分隔符切分
    }
    return input
      .split(/[,，|]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}
