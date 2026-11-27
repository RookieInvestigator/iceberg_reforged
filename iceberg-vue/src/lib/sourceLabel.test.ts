import { describe, expect, it } from 'vitest'
import { extractUrlTitle, hostOf, linkDisplay, sourceLabel } from './sourceLabel'

describe('hostOf / sourceLabel', () => {
  it('去协议与 www、转小写；非 http(s) 回退空串', () => {
    expect(hostOf('https://www.baike.baidu.com/item/x')).toBe('baike.baidu.com')
    expect(hostOf('http://ZH.wikipedia.org/wiki/A')).toBe('zh.wikipedia.org')
    expect(hostOf('mailto:a@b.c')).toBe('')
    expect(hostOf('')).toBe('')
  })

  it('命中域名表用站点名，未知域名回退域名本身（不编造）', () => {
    expect(sourceLabel('https://zhuanlan.zhihu.com/p/1')).toBe('知乎专栏')
    expect(sourceLabel('https://zh.wikipedia.org/wiki/A')).toBe('维基百科')
    expect(sourceLabel('https://unknown.example/a')).toBe('unknown.example')
  })
})

describe('linkDisplay（词条链接与参考链接统一口径）', () => {
  it('人工 label 优先，副文案是域名；占位纯词不追加标题', () => {
    expect(linkDisplay('百度百科', 'https://baike.baidu.com/item/x')).toEqual({
      name: '百度百科', host: 'baike.baidu.com', showHost: true,
    })
  })

  it('尽可能组合「网站名 · 页面标题」，同时避免重复站点名或域名占位', () => {
    expect(linkDisplay('', 'https://zh.wikipedia.org/zh-hans/%E6%B0%B4%E7%8C%B4%E5%AD%90')).toEqual({
      name: '维基百科 · 水猴子', host: 'zh.wikipedia.org', showHost: true,
    })
    expect(linkDisplay('百度百科', 'https://baike.baidu.com/item/%E9%98%B4%E9%98%B3%E7%9C%BC/7981406')).toEqual({
      name: '百度百科 · 阴阳眼', host: 'baike.baidu.com', showHost: true,
    })
    expect(linkDisplay('那年月的“鸡血疗法”闹剧', 'https://epaper.gmw.cn/wzb/html/2013-01/17/nw.D110000wzb_20130117_2-08.htm')).toEqual({
      name: '光明日报 · 那年月的“鸡血疗法”闹剧', host: 'epaper.gmw.cn', showHost: true,
    })
    expect(linkDisplay('kpzg.people.com.cn', 'http://kpzg.people.com.cn/n1/2016/0729/c404390-28595983.html')).toEqual({
      name: '人民网', host: 'kpzg.people.com.cn', showHost: true,
    })
    expect(linkDisplay('', 'https://github.com/RookieInvestigator/Iceberg-Archive/blob/main/%E7%9B%97%E8%82%BE%E4%BC%A0%E8%AF%B4.pdf').name)
      .toBe('GitHub · RookieInvestigator/Iceberg-Archive · 盗肾传说')
    expect(linkDisplay('', 'https://www.reddit.com/r/UnresolvedMysteries/comments/3vypa3/since_1780_more_than_60_chinese_porcelain_seals/').name)
      .toBe('Reddit · r/UnresolvedMysteries · since 1780 more than 60 chinese porcela…')
    expect(linkDisplay('', 'https://web.archive.org/web/20130916013543/https://culture.ifeng.com/8/detail_2012_08/26/17099039_0.shtml').name)
      .toBe('互联网档案馆 · 凤凰网')
  })

  it('过滤 CMS 编号、微信短 token 等无意义路径段', () => {
    expect(extractUrlTitle('https://www.thepaper.cn/newsDetail_forward_11152898')).toBe('')
    expect(extractUrlTitle('https://mp.weixin.qq.com/s/9DQCVoHp_baj_-yDZmaYUg')).toBe('')
    expect(extractUrlTitle('https://www.hnmuseum.com/zh-hans/zuixintuijie/%E9%A9%AC%E7%8E%8B%E5%A0%86%E4%B8%80%E5%8F%B7%E6%B1%89%E5%A2%93t%E5%BD%A2%E5%B8%9B%E7%94%BB'))
      .toBe('马王堆一号汉墓t形帛画')
  })

  it('label 缺失或等于 url 时按域名派生（旧副表把 url 当 label 写过）', () => {
    const url = 'https://zhuanlan.zhihu.com/p/667999199'
    expect(linkDisplay(undefined, url).name).toBe('知乎专栏')
    expect(linkDisplay('', url).name).toBe('知乎专栏')
    expect(linkDisplay(url, url).name).toBe('知乎专栏')
  })

  it('未知域名不重复显示域名', () => {
    const d = linkDisplay('', 'https://unknown.example/a')
    expect(d).toEqual({ name: 'unknown.example', host: 'unknown.example', showHost: false })
  })
})

describe('识别覆盖：父域回退 / 家族规则 / 后缀规则', () => {
  it('父域回退 —— 子域千变万化，主干域名有限', () => {
    expect(sourceLabel('https://user.guancha.cn/main/content?id=1')).toBe('观察者网')
    expect(sourceLabel('https://space.bilibili.com/510877118')).toBe('哔哩哔哩')
    expect(sourceLabel('https://k.sina.cn/article_x.html')).toBe('新浪')
    expect(sourceLabel('https://m.douban.com/book/subject/1/')).toBe('豆瓣')
    expect(sourceLabel('https://book.douban.com/subject/1/')).toBe('豆瓣读书') // 精确优先
    expect(sourceLabel('https://tw.news.yahoo.com/x')).toBe('Yahoo奇摩新闻')
  })

  it('家族规则 —— fandom / wikidot 取子域作 Wiki 名，维基各语种统一', () => {
    expect(sourceLabel('https://foo.fandom.com/wiki/x')).toBe('Foo Wiki')
    expect(sourceLabel('https://other.wikidot.com/x')).toBe('Other Wiki')
    expect(sourceLabel('https://de.wikipedia.org/wiki/x')).toBe('维基百科')
    expect(sourceLabel('https://zh.wikisource.org/wiki/x')).toBe('维基文库')
    expect(sourceLabel('https://lostmedia.wikidot.com/x')).toBe('Lost Media Wiki') // 精确优先
  })

  it('后缀规则覆盖裸域与任意子域；精确表优先', () => {
    expect(sourceLabel('https://www.pku.edu.cn/x')).toBe('高校网站')
    expect(sourceLabel('https://www.gov.cn/x')).toBe('政府网站')
    expect(sourceLabel('https://kepu.gov.cn/x')).toBe('中国科普网')
    expect(sourceLabel('https://someone.github.io/x')).toBe('GitHub Pages')
    expect(sourceLabel('https://xx.substack.com/p/1')).toBe('Substack')
    expect(sourceLabel('https://legco.gov.hk/x')).toBe('香港政府网站')
  })

  it('站内实测域名抽样（954 条链接里出现过的）', () => {
    expect(sourceLabel('https://www.chinanews.com.cn/gn/2022/07-10/9800270.shtml')).toBe('中国新闻网')
    expect(sourceLabel('https://baijiahao.baidu.com/s?id=1')).toBe('百家号')
    expect(sourceLabel('https://kns.cnki.net/kcms2/article/x')).toBe('中国知网')
    expect(sourceLabel('https://ctext.org/zhuangzi/x')).toBe('中国哲学书电子化计划')
    expect(sourceLabel('https://www.nlc.cn/x')).toBe('中国国家图书馆')
    expect(sourceLabel('https://de.hnmuseum.com/x')).toBe('湖南博物院')
    expect(sourceLabel('https://www.acfun.cn/v/ac1')).toBe('AcFun')
    expect(sourceLabel('https://www.chinatimes.com/cn/x')).toBe('中时新闻网')
    expect(sourceLabel('https://www.cbaigui.com/monster/113')).toBe('纪妖')
    // 人工认领（逐站核对页面自称名）后的样本
    expect(sourceLabel('https://www.aweidao1.com/t/47281639')).toBe('阿苇岛')
    expect(sourceLabel('https://www.nmbxd1.com/t/57952798')).toBe('X岛揭示板')
    expect(sourceLabel('https://ohsir.tw/6812/')).toBe('疑案辦')
    expect(sourceLabel('https://taiping.5000yan.com/21746.html')).toBe('5000言') // 父域回退
    // 仍不认识的站点：老老实实露域名，不编造站名（等有人认领再进表）
    expect(sourceLabel('http://mcvlcssbc.us/')).toBe('mcvlcssbc.us')
  })
})
