// 悬浮提示自适应归位（V2 徽章 tip）：hover/聚焦时量取 tip 与滚动容器
// （.modal-body / .sheet-body）的矩形，左右超界则平移收回容器内（留 8px 边距）。
// opacity:0 的元素仍参与布局，可直接测量，无需先显示。
const PAD = 8

export function fitTipIntoView(link: HTMLElement | null): void {
  if (!link) return
  const tip = link.querySelector<HTMLElement>('.meta-tip')
  if (!tip) return
  tip.style.removeProperty('margin-left')
  const host = link.closest('.modal-body, .sheet-body')
  const left = host ? host.getBoundingClientRect().left : PAD
  const right = host ? host.getBoundingClientRect().right : window.innerWidth - PAD
  const r = tip.getBoundingClientRect()
  let dx = 0
  if (r.left < left + PAD) dx = left + PAD - r.left
  else if (r.right > right - PAD) dx = right - PAD - r.right
  if (dx) tip.style.marginLeft = `${Math.round(dx)}px`
}

export function clearTipFit(link: HTMLElement | null): void {
  link?.querySelector<HTMLElement>('.meta-tip')?.style.removeProperty('margin-left')
}
