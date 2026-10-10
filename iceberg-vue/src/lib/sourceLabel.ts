/**
 * 外链的来源站点识别（**词条链接与参考链接共用同一套**）：**站点名 + 域名**，
 * 站点名优先取人工写的 label，没写就按域名判。
 *
 * 识别分三层（覆盖率来自实测：954 条链接 / 219 个宿主，未识别仅剩 2 个）：
 *   1. 精确表 SOURCE_LABELS —— 认识的站点
 *   2. **父域回退** —— `news.sina.com.cn` → 命中 `sina.com.cn`；`book.douban.com` → 命中 `douban.com`。
 *      这一层收益最大：子域千变万化，主干域名有限
 *   3. 家族规则 —— `*.fandom.com` → 「Xxx Wiki」、`*.wikidot.com`、`*.edu.cn` 等
 * 都不命中时**回退域名本身**（宁可露出域名，也不编造站名）。
 *
 * 与 scripts/apply_feedback.py 的 LABELS 是同一份口径（那边落盘时写 label，这边渲染时兜底派生），
 * 新增站点两边一起加。
 */

/** 域名 → 站点名（含主干域名，供父域回退命中）。导出供副表编辑器的「显示名」候选使用 */
export const SOURCE_LABELS: Record<string, string> = {
  // 百科 / 维基系
  'baike.baidu.com': '百度百科',
  'zhidao.baidu.com': '百度知道',
  'wenku.baidu.com': '百度文库',
  'baijiahao.baidu.com': '百家号',
  'baidu.com': '百度',
  'tieba.baidu.com': '百度贴吧',
  // 维基系只列「与通用名不同」的语种；其余 xx.wikipedia.org 走家族规则
  'zh.wikipedia.org': '维基百科',
  'ja.wikipedia.org': '维基百科（日文）',
  'en.wikipedia.org': 'Wikipedia',
  'wikimedia.org': '维基媒体',
  'moegirl.org.cn': '萌娘百科',
  'zhonghuadiancang.com': '中华典藏',
  'cbaigui.com': '纪妖',
  'ctext.org': '中国哲学书电子化计划',
  'trow.cc': 'The Ring of Wonder',
  'kknews.cc': '每日头条',
  'quanxue.cn': '劝学网',
  'dili360.com': '中国国家地理网',
  'lostmedia.wikidot.com': 'Lost Media Wiki',
  'screamer.wiki': 'Screamer Wiki',
  'urban-legend.fandom.com': 'Urban Legend Wiki',

  // 社区 / 内容平台
  'zhihu.com': '知乎',
  'zhuanlan.zhihu.com': '知乎专栏',
  'weixin.qq.com': '微信',
  'mp.weixin.qq.com': '微信公众号',
  'weibo.com': '微博',
  'weibo.cn': '微博',
  'douban.com': '豆瓣',
  'book.douban.com': '豆瓣读书',
  'movie.douban.com': '豆瓣电影',
  'bilibili.com': '哔哩哔哩',
  'b23.tv': '哔哩哔哩（短链）',
  'acfun.cn': 'AcFun',
  'douyin.com': '抖音',
  'ixigua.com': '西瓜视频',
  'kuaishou.com': '快手',
  'xiaohongshu.com': '小红书',
  'toutiao.com': '今日头条',
  'lofter.com': 'LOFTER',
  'coolapk.com': '酷安',
  'jianshu.com': '简书',
  'hupu.com': '虎扑',
  'v2ex.com': 'V2EX',
  'bangumi.tv': 'Bangumi 番组计划',
  'tianya.cn': '天涯社区',
  'huxiu.com': '虎嗅',
  '36kr.com': '36氪',
  'sspai.com': '少数派',
  'guokr.com': '果壳',
  'pansci.asia': '泛科学',
  '360doc.com': '个人图书馆',
  'doc88.com': '道客巴巴',
  'cnki.net': '中国知网',
  'kns.cnki.net': '中国知网',
  'ncpssd.cn': '国家哲学社会科学文献中心',
  'wanfangdata.com.cn': '万方数据',
  'cqvip.com': '维普',
  'csdn.net': 'CSDN',
  'cnblogs.com': '博客园',
  'juejin.cn': '掘金',
  'github.com': 'GitHub',
  'gitee.com': 'Gitee',
  'itch.io': 'itch.io',
  'steampowered.com': 'Steam',
  'steamcommunity.com': 'Steam 社区',

  // 新闻 / 媒体
  'thepaper.cn': '澎湃新闻',
  'chinanews.com.cn': '中国新闻网',
  'xinhuanet.com': '新华网',
  'news.cn': '新华网',
  'people.com.cn': '人民网',
  'gmw.cn': '光明网',
  'epaper.gmw.cn': '光明日报',
  'cctv.com': '央视网',
  'cctv.cn': '央视网',
  'news.cctv.com': '央视新闻',
  'cntv.cn': '央视网',
  'ifeng.com': '凤凰网',
  'udn.com': '联合新闻网',
  'time.udn.com': '报时光（联合报）',
  'techbang.com': 'T客邦',
  'qidongnews.com': '启东新闻网',
  'weekendhk.com': '新假期',
  'goody25.com': 'Goody25',
  'ddm.com.tw': '法鼓山',
  'xubing.com': '艺术家徐冰官网',
  'guancha.cn': '观察者网',
  'huanqiu.com': '环球网',
  'cyol.com': '中国青年报',
  'chinatimes.com': '中时新闻网',
  'yahoo.com': 'Yahoo',
  'tw.news.yahoo.com': 'Yahoo奇摩新闻',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'cnn.com': 'CNN',
  'nytimes.com': '纽约时报',
  'theguardian.com': '卫报',
  'reuters.com': '路透社',
  'apnews.com': '美联社',
  'washingtonpost.com': '华盛顿邮报',
  'sina.com.cn': '新浪',
  'news.sina.com.cn': '新浪新闻',
  'blog.sina.com.cn': '新浪博客',
  'sina.cn': '新浪',
  'sohu.com': '搜狐',
  'news.sohu.com': '搜狐新闻',
  '163.com': '网易',
  'news.163.com': '网易新闻',
  'qq.com': '腾讯',
  'news.qq.com': '腾讯新闻',
  'toutiao.cn': '今日头条',
  'kepuchina.cn': '科普中国',
  'kepu.gov.cn': '中国科普网',
  'cas.cn': '中国科学院',
  'cssn.cn': '中国社会科学网',
  'chinesefolklore.org.cn': '中国民俗学网',
  'chinafolklore.org': '中国民俗学网',
  'tanmizhi.com': '探秘志',
  'sogou.com': '搜狗',
  'qcc.com': '企查查',
  'hk01.com': '香港01',
  'lingyizhi.com': '灵异志',
  'wikiwand.com': 'WikiWand',
  'enorth.com.cn': '北方网',
  'xnnews.com.cn': '咸宁新闻网',
  'sciencenet.cn': '科学网',
  'cqkaogu.com': '重庆考古',
  'gitbook.io': 'GitBook',
  'nmth.gov.tw': '国立台湾历史博物馆',
  'jzmsm.org': '荆州博物馆',
  'rmzxw.com.cn': '人民政协网',
  'mpweekly.com': '明周文化',
  '720yun.com': '720云',
  'storm.mg': '风传媒',
  'chinagate.cn': '中国网',
  'icebergcharts.com': 'IcebergCharts',
  'niar.org.tw': '国家实验研究院',
  'chinawriter.com.cn': '中国作家网',
  'shidianguji.com': '识典古籍',
  'shiwenxuan.com': '诗文选',
  'qingdaonews.com': '青岛新闻网',
  'thenewslens.com': '关键评论网',
  'sbs.com.au': 'SBS',
  'edx.org': 'edX',
  'cw.com.tw': '天下杂志',
  'shejibiji.com': '设计笔记',
  'baike.com': '互动百科',
  'tieba.com': '百度贴吧',
  'chinanews.com': '中国新闻网',
  'xzxw.com': '中国西藏新闻网',
  'zdic.net': '汉典',
  'qiuwenbaike.cn': '求闻百科',
  'ngabbs.com': 'NGA 玩家社区',
  'wxredian.com': '微信热点',
  'xhslink.com': '小红书（短链）',
  'bjnews.com.cn': '新京报',
  'thecover.cn': '封面新闻',
  'rednet.cn': '红网',
  'kechuang.org': '科创论坛',
  'guoxuemi.com': '国学迷',
  'mplus.org.hk': 'M+ 博物馆',
  'ancient-origins.net': 'Ancient Origins',
  'livescience.com': 'Live Science',
  'atlasobscura.com': 'Atlas Obscura',
  'iacr.org': 'IACR（国际密码学研究协会）',
  'namu.wiki': 'namu.wiki',
  'snzg.net': '三农中国网',
  'ahyouth.com': '安徽青年报',
  'cnacs.net.cn': '中国工艺美术学会',
  'globalgeopark.org.cn': '世界地质公园网络',
  'data.geophy.cn': '地球物理数据',
  'cphoto.net': '中国摄影在线',
  'kekeshici.com': '可可诗词网',
  'ayyx.com': '安阳殷墟',
  '997788.com': '中华收藏网',
  'longmarchspace.com': '长征空间',

  // 博物馆 / 图书馆 / 档案
  'chnmuseum.cn': '中国国家博物馆',
  'hnmuseum.com': '湖南博物院',
  'jinshasitemuseum.com': '金沙遗址博物馆',
  'hzmuseum.com': '杭州博物馆',
  'dpm.org.cn': '故宫博物院',
  'nlc.cn': '中国国家图书馆',
  'archive.org': '互联网档案馆',
  'web.archive.org': '互联网档案馆',

  // 海外 / 通用平台
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'twitter.com': 'X（推特）',
  'x.com': 'X（推特）',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'reddit.com': 'Reddit',
  'tumblr.com': 'Tumblr',
  'twitch.tv': 'Twitch',
  'nicovideo.jp': 'niconico',
  'pixiv.net': 'pixiv',
  'tvtropes.org': 'TV Tropes',
  'wikidot.com': 'Wikidot',
  'fandom.com': 'Fandom',
  'pinimg.com': 'Pinterest',
  'pinterest.com': 'Pinterest',

  // 人工认领：来源是各站**页面自称名**（title / og:site_name / 页脚版权行），不是从域名猜的。
  // 子域站点一律登记**父域**，让父域回退统一兜住（tianya.at 与 tianya.cn 同名不同站，各登记各的）。
  'alcoo.com': 'ALCOO',
  'artda.cn': '艺术档案',
  'aweidao1.com': '阿苇岛',
  'blackstory.tw': '黑色酒吧',
  'boxford.org.uk': 'Boxford',
  'fx361.cc': '参考网',
  'jcedu.org': '西园戒幢律寺',
  'kexinzhongxin.com': '科信食品与健康信息交流中心',
  'loveufo.com': '雷尔利安运动（中国）',
  'niweihua.com': '倪卫华个人艺术网站',
  'nmbxd1.com': 'X岛揭示板',
  'ohsir.tw': '疑案辦',
  'pulung.com': '尊聖普隆佛閣',
  'serotoninphobia.info': 'Serotonin Pharmaceuticals',
  'tianya.at': '天涯',
  'ytlch.com': '烟台革命老区网',
  'yywzw.com': '语言文字网',
  'zuoxuan.com': '左旋',
  '5000yan.com': '5000言',
  '99wat.com': 'เก้าสิบเก้าวัด',
}

/** 家族规则（子域敏感）：`foo.fandom.com` → 「Foo Wiki」、`de.wikipedia.org` → 维基百科 */
function familyLabel(parent: string, sub: string): string {
  const cap = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : ''
  if (parent === 'fandom.com') return cap ? `${cap} Wiki` : 'Fandom'
  if (parent === 'wikidot.com') return cap ? `${cap} Wiki` : 'Wikidot'
  if (parent === 'wikipedia.org') return '维基百科'
  if (parent === 'wikisource.org') return '维基文库'
  return ''
}

/** 后缀规则（子域无关，且覆盖裸域本身：`gov.cn` / `www.gov.cn` 同为政府网站） */
const SUFFIX_LABELS: Array<[string, string]> = [
  ['edu.cn', '高校网站'],
  ['gov.cn', '政府网站'],
  ['gov.hk', '香港政府网站'],
  ['gov.mo', '澳门政府网站'],
  ['gov.tw', '台湾政府网站'],
  ['edu.tw', '台湾高校'],
  ['ac.cn', '科研机构'],
  ['github.io', 'GitHub Pages'],
  ['blogspot.com', 'Blogger'],
  ['wordpress.com', 'WordPress'],
  ['substack.com', 'Substack'],
  ['medium.com', 'Medium'],
  ['notion.site', 'Notion'],
]

/** 取主机名：去协议、去 www.、小写（拿不到主机名时回退空串） */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec((url || '').trim())
  return (m ? m[1] : '').replace(/^www\./i, '').toLowerCase()
}

/**
 * 站点名：精确表 → 父域回退（含家族规则）→ 后缀规则 → 回退域名本身。
 * 父域回退是覆盖率的关键：`news.sina.com.cn` 命中 `sina.com.cn`、`book.douban.com` 命中 `douban.com`。
 */
export function sourceLabel(url: string): string {
  const host = hostOf(url)
  if (!host) return ''
  const exact = SOURCE_LABELS[host]
  if (exact) return exact

  const parts = host.split('.')
  // i 从 1 起：逐级去掉最左标签（a.b.c → b.c → c）
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(i).join('.')
    const fam = familyLabel(parent, parts.slice(0, i).join('.'))
    if (fam) return fam
    const hit = SOURCE_LABELS[parent]
    if (hit) return hit
  }
  for (const [sfx, label] of SUFFIX_LABELS) {
    if (host === sfx || host.endsWith('.' + sfx)) return label
  }
  return host
}

export interface LinkDisplay {
  /** 主文案：人工 label 优先（但不接受「label 就是 URL」这种占位） */
  name: string
  /** 副文案：域名 */
  host: string
  /** 是否需要在 name 之后再显示域名（未知站点时两者相同，显示一次即可） */
  showHost: boolean
}

/** 词条链接与参考链接统一的展示口径：`linkDisplay(label, url)` */
export function linkDisplay(label: string | undefined, url: string): LinkDisplay {
  const l = (label || '').trim()
  const host = hostOf(url)
  const name = l && l !== url ? l : (sourceLabel(url) || url)
  return { name, host, showHost: !!host && name !== host }
}
