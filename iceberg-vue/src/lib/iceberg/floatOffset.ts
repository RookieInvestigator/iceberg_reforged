// 错落排版偏移（原 floatMode=static 的 DOM 后写逻辑，前移到渲染层）：
// 词条按 id 哈希得固定随机偏移，随挂载自然生效，不再依赖 setup 时机的全量遍历
// （修「进 V2 无错落，需开关重开」：渐进挂载的后 6 层以前永远拿不到偏移）。
// 数值与旧逻辑逐字一致（有符号 32 位哈希：tx ∈ [-4.5, 1.5)px，ty ∈ [-9, 3)px）。
export function floatOffsetFor(id: string): { x: string; y: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return {
    x: (((h % 300) / 100) - 1.5).toFixed(2),
    y: ((((h * 37) % 600) / 100) - 3).toFixed(2),
  }
}
