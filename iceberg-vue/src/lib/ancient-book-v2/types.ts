/**
 * 古籍 v2 · 类型定义
 *
 * 设计原则：
 * - 版面参数**全部可配**，不写死在 CSS 里
 * - 单元格坐标用「列 / 行」整数，渲染层再换算成像素
 * - 夹注用 `subCol`（1 = 右列 / 2 = 左列）表达
 */

/**
 * 句读只有「显示 / 不显示」两种状态（`TypographyPrefs.punct`）。
 * 早先做过三档（圈点 / 现代标点 / 白文）与四档位置，
 * 但正文里的标点符号在解析阶段就被吃进 `pn` 了，现代标点档实际等于把标点塞回字格，
 * 视觉上只是「字更大的一版圈点」，留着只会让人以为有别的排法。
 */

/**
 * 版心的装饰（黑口 + 鱼尾）是固定的 SVG，不再做成配置项。
 * 版心只有 20~30px 宽，鱼尾形态/线宽这类开关在这么小的尺寸下没有可辨差别，
 * 留在设置面板里只会让人以为调了有用。
 */

/**
 * 字体族（古籍常用）。
 *
 * 五款**自托管**字体 = 传统四体（宋黑楷仿宋）+ 一款长体仿宋：
 * 宋（思源宋）/ 黑（思源黑）/ 楷（汇迹正楷）/ 仿宋（朱雀仿宋）/ 长体仿宋（仲春仿宋）。
 * 系统楷体/仿宋已移除 —— 它们在各平台字形差异极大，同一页在 Windows 与
 * macOS 上是两种字，古籍版式经不起这种漂移。
 * 生僻字统一由花园明朝（HanaMinA）兜底，见 layout.ts 的 FONT_STACKS。
 */
export type FontFamily = 'song' | 'hei' | 'kai' | 'fangsong' | 'sotyr'

/** 版面配置 */
export interface LayoutConfig {
  /** 字号（px） */
  fontSize: number
  /** 字格宽 = 字号 × 此系数（密排 1.08） */
  cellWidthRatio: number
  /** 行距 = 字号 × 此系数 */
  lineHeightRatio: number
  /** 版心宽 = 字格 × 此系数 */
  spineRatio: number
  /** 天头占版面高比例 */
  headRatio: number
  /** 地脚占版面高比例 */
  footRatio: number
  /** 页面左右留白占版面宽的比例（书口那一侧） */
  marginRatio: number
  /** 书口 : 订口 = 此值 : 1（越大外侧留白越宽） */
  gutterRatio: number
  /** 导航栏预留高度（px） */
  navHeight: number
  /** 单页模式（窄屏） */
  single: boolean
  /** 列间距（字格宽的倍数，0 = 密排无间距） */
  colGap: number
  /** 西文相对字号（西文串旋转 90° 后的视觉大小） */
  engScale: number
  /** 字体族 */
  font: FontFamily
}

/** 用户可调的排版偏好（设置页持久化） */
export interface TypographyPrefs {
  font: FontFamily
  /** 字号缩放（0.85 – 2.00；上限放到 200% 给「大字本」留出空间） */
  fontScale: number
  /** 西文相对字号（0.60 – 1.20，旋转 90° 后的西文常显偏小，留给人自己试） */
  engScale: number
  /** 列间距（0 – 1.2，字格宽的倍数；0 = 密排，1.2 时列间空出一整格） */
  colGap: number
  /** 行距系数（0.95 – 2.2） */
  lineHeight: number
  /** 天头比例（0.10 – 0.30） */
  headRatio: number
  /** 页面左右留白（0.02 – 0.12，占版面宽的比例） */
  marginRatio: number
  /** 书口 : 订口（1.0 – 2.6，1.4 ≈ 传统线装书的比例） */
  gutterRatio: number
  /** 句读（圈点）：只有显示 / 不显示两种 */
  punct: boolean
  /** 界行（乌丝栏）开关 */
  rules: boolean
  /** 界行是否贯穿天头地脚（关：只在正文区内，上下留白干净） */
  rulesFull: boolean
  /** 手机：左右滑动翻页 */
  swipeTurn: boolean
  /** 手机：点按左右三分之一翻页 */
  tapTurn: boolean
}

/**
 * 圈点的样式。位置与颜色是**稿本的固定写法**（字格下缘偏右、朱色），
 * 不再做成配置项 —— 只有一个开关（`TypographyPrefs.punct`）。
 */
export interface JudouConfig {
  /** 相对字号的大小 */
  size: number
  /** 颜色（CSS 值） */
  color: string
}

/** 一个字符 token（解析产物） */
export interface Token {
  /** 字符 */
  c: string
  /** 是否夹注（双行小字） */
  cm: boolean
  /** 是否词条标题（可点击） */
  hw: boolean
  /** 标题内的括号附注 */
  hp?: boolean
  /** 强制分页 */
  pb?: boolean
  /** 段落分隔 */
  nl?: boolean
  /** 句读标记：'。' 句 / '、' 读 */
  pn?: string
  /** 词条索引（-1 = 非词条） */
  ii: number
  /** 镜像字（「廻戮戈」逐字左右翻转） */
  mr?: boolean
  /** 是否西文 */
  isEng?: boolean
  /** 专名号 */
  vr?: boolean
  /** 书名号 */
  bk?: boolean
}

/** 已定位的单元格 */
export interface PlacedCell extends Token {
  /** 物理页号（0 起） */
  pg: number
  /** 列号（0 起，从右往左） */
  cl: number
  /** 行号（0 起，从上往下） */
  rw: number
  /** 夹注子列：0=非夹注，1=右列，2=左列 */
  subCol: 0 | 1 | 2
  /** 夹注子行：0=上半，1=下半 */
  subRow: 0 | 1
  /** 跨行数（西文占多行） */
  span: number
  /**
   * 西文补字距（px）：旋转后的串宽量化到整行时有零头，
   * 与其改字号（连带改观感），不如把零头摊进字距，让串正好占满它占的格子。
   */
  els?: number
  /**
   * 眉批：写在该词条**起首字所在列的天头**里的批注。
   * 每个字都是**夹注那套小字格**（半格宽 × 半行高），由视图层在排版后贴上。
   */
  mp?: MarginalChar[]
}

/**
 * 眉批里的一个小字 —— 与夹注同一套「一格 4 小字」定位。
 *
 * `h` = 第几个半列（0 = 词条列的右半列，1 = 同列的左半列，2 = 左边一列的右半列…），
 * 这样「先填满一个半列、再填下一个半列」就是 `h` 递增；
 * `r` = 该半列内的行号（一行 = 半格高）。
 */
export interface MarginalChar {
  c: string
  h: number
  r: number
}

/** 版面计算结果 */
export interface LayoutResult {
  cols: number
  rows: number
  /** spreads[展][页(0=右,1=左)] = 单元格 */
  spreads: PlacedCell[][][]
  max: number
  cur: number
  single: boolean
  /** 天头能放几行眉批小字（一行 = 半格高） */
  marginalRows: number
  /** 注入根元素的 CSS 变量 */
  cssVars: Record<string, string>
}

/** 词条元数据（详情弹层用） */
export interface EntryMeta {
  id: string
  title: string
  cat: string
  color: string
  tags: string[]
  desc: string
  link: string
  tier: string
}
