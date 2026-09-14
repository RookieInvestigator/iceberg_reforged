/**
 * exportMetrics —— 导出模块的静态小件（量纲常量）。
 * 单独成文件的原因：调用方（ExportImageButton）在首屏包内只能静态引用它；
 * wallExport 本体 + qrcode 必须走动态 import 进懒包，任何对 wallExport 的
 * 静态值引用都会把整包拖回首屏（Vite 警告：dynamic import will not move module）。
 */
export const V2_EXPORT_METRICS = {
  padX: 12.8, // 0.8rem
  padY: 4.8, // 0.3rem
  gapX: 20, // gap-x-5
  gapY: 16, // gap-y-4
  contentPadX: 60, // --header-padding-x
  tierPadY: 52,
  headerPx: 13,
  headerMarginBottom: 36,
  lineHeight: 1.4, // v2 覆盖（全局 1.5 不动）
  chipFontScale: 1.15, // 1.15em
  emojiRatio: 0.625, // text-[0.625em]
  emojiGapEm: 0.3, // ml-[0.3em]
  emojiLiftEm: 0.08, // -top-[0.08em]
} as const;
