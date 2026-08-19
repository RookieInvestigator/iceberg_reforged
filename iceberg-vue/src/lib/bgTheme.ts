/**
 * 站点流体背景的统一配色与调参（home / handbook / features / feature-detail / on-this-day 等静态背景页共用）。
 *
 * 调参只改这里，不要在页面里手写色值：
 *   - 亮暗：改 BRIGHTNESS（CSS filter，<1 更暗，>1 提亮，1 = 不变）
 *   - 饱和：改 SATURATION（着色器色度乘子，<1 更灰，0 = 完全去色，1 = 不变）
 *   - 加黑：改 DARK_SHIFT（着色器采样向深色端偏移，>0 黑色占比更多，沉海感更强）
 * 色值 colorA–colorE 只决定色相，调明暗/饱和不需要动它。
 */
export const BG_COLORS = {
  colorA: '#000000',
  colorB: '#012945',
  colorC: '#045B8D',
  colorD: '#0076A2',
  colorE: '#B25512',
} as const

export const BG_TUNING = {
  brightness: 1, // CSS filter: brightness()
  saturation: 0.9, // shader u_saturation（OkLab 色度乘子）
  darkShift: 0, // shader u_darkShift（采样向深色端偏移）
} as const
