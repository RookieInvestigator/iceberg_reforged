// 错落排版偏移：词条按 id 哈希得固定随机偏移，随挂载自然生效
// （在渲染层直接算，不做 setup 时机的全量遍历 —— 渐进挂载的后几层会拿不到偏移）。
// 有符号 32 位哈希：tx ∈ [-4.5, 1.5)px，ty ∈ [-9, 3)px。
export function floatOffsetFor(id: string): { x: string; y: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return {
    x: (((h % 300) / 100) - 1.5).toFixed(2),
    y: ((((h * 37) % 600) / 100) - 3).toFixed(2),
  }
}
