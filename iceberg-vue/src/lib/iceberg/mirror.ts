/**
 * 镜像字：词条「廻戮戈」的三个字按印版反字的样子显示（整串里只翻这三个字）。
 *
 * 逐字翻转、字序不变 —— 一个字一个字横向镜像，读起来仍是原来那个名字；
 * 整串一起 scaleX(-1) 会把字序也倒过来（变成「戈戮廻」），不是要的效果。
 */
export const MIRROR_PHRASE = '廻戮戈'

export interface MirrorSegment {
  text: string
  /** 该段是否逐字镜像 */
  mirror: boolean
}

/** 把任意文本切成「普通段」与「需要镜像的字」两类，供渲染层逐段输出 */
export function splitMirror(text: string): MirrorSegment[] {
  if (!text || !text.includes(MIRROR_PHRASE)) return text ? [{ text, mirror: false }] : []
  const out: MirrorSegment[] = []
  let i = 0
  while (i < text.length) {
    if (text.startsWith(MIRROR_PHRASE, i)) {
      out.push({ text: MIRROR_PHRASE, mirror: true })
      i += MIRROR_PHRASE.length
    } else {
      const next = text.indexOf(MIRROR_PHRASE, i)
      const end = next === -1 ? text.length : next
      out.push({ text: text.slice(i, end), mirror: false })
      i = end
    }
  }
  return out
}

/** 古籍模式按「字」排版，判断某一个字是否属于镜像串 */
export function isMirrorCharAt(text: string, index: number): boolean {
  return text.startsWith(MIRROR_PHRASE, index) ||
    (index > 0 && index < text.length - 1 && text.slice(Math.max(0, index - 1), index + 2) === MIRROR_PHRASE)
}
