import { describe, expect, it } from 'vitest'
import {
  extractEntryEntities,
  extractNouns,
  extractPlaces,
  extractPlatforms,
  extractTimes,
  formatEntityList,
  parseEntityList,
  timeParentPeriod,
  yearToDecade,
} from './entityExtract'

describe('entityExtract · 地名 / 时间 / 名词抽取', () => {
  it('能抽取并归一化常见地名，同时避免把「中国湖南」误切为「中国湖」、把「华南虎」误判为「华南」', () => {
    const places1 = extractPlaces('发生在北京市与东北地区的怪谈，后来流传到香港')
    expect(places1).toContain('北京')
    expect(places1).toContain('东北')
    expect(places1).toContain('香港')

    const places2 = extractPlaces('流传于中国湖南的都市传说，带有一种诡异的世界观，藏语典籍亦有记载')
    expect(places2).toContain('中国')
    expect(places2).toContain('湖南')
    expect(places2).toContain('西藏')
    expect(places2).not.toContain('中国湖')
    expect(places2).not.toContain('都市')

    const places3 = extractPlaces('2007年陕西省镇坪县村民拍摄到野生华南虎照片，非印度洋海岸事件')
    expect(places3).toContain('陕西')
    expect(places3).toContain('镇坪')
    expect(places3).not.toContain('华南')
    expect(places3).toContain('印度洋')
    expect(places3).not.toContain('印度')

    const places4 = extractPlaces('一段流传在藏语口传故事里的雪域奇谈')
    expect(places4).toContain('西藏')
  })

  it('能做细粒度时间分类（精确年份、年代分段、分期朝代、世纪分段与节令）', () => {
    const times = extractTimes('始于上世纪90年代末，1995年最火，另有西汉、清末、20世纪初及中元节记载')
    expect(times).toContain('1995年')
    expect(times).toContain('1990年代末')
    expect(times).toContain('西汉')
    expect(times).toContain('清末')
    expect(times).toContain('20世纪初')
    expect(times).toContain('中元节')

    expect(yearToDecade('1995年')).toBe('1990年代')
    expect(yearToDecade('清末')).toBeNull()
    expect(timeParentPeriod('清末')).toBe('清代')
    expect(timeParentPeriod('西汉')).toBe('汉代')
    expect(timeParentPeriod('1990年代末')).toBe('1990年代')
  })

  it('能抽取「华南虎→虎」「猫」、书名号作品与英文缩写', () => {
    const nouns1 = extractNouns('猫脸老太太', '出自《山海经》式的都市传说，因猫而诈尸，也有人联想到 UFO')
    expect(nouns1).toContain('《山海经》')
    expect(nouns1).toContain('都市传说')
    expect(nouns1).toContain('诈尸')
    expect(nouns1).toContain('猫')
    expect(nouns1).toContain('UFO')

    const nouns2 = extractNouns('华南虎照片事件', '宣称拍摄到野生华南虎照片')
    expect(nouns2).toContain('虎')
    expect(nouns2).not.toContain('华南虎')
    expect(nouns2).toContain('照片')
  })

  it('对同义词和近义概念进行规范聚类（如 飞碟/不明飞行物→UFO、厉鬼/鬼魂→幽灵、公墓/坟墓→墓地）', () => {
    const a = extractNouns('飞碟目击', '有人看到不明飞行物降落在公墓附近的古庙里')
    const b = extractNouns('UFO 档案', '坟墓和寺庙旁出现的神秘现象，怀疑与鬼魂或厉鬼有关')
    expect(a).toContain('UFO')
    expect(a).toContain('墓地')
    expect(a).toContain('寺庙')
    expect(b).toContain('UFO')
    expect(b).toContain('墓地')
    expect(b).toContain('寺庙')
    expect(b).toContain('幽灵')
    expect(b).not.toContain('鬼魂')
    expect(b).not.toContain('厉鬼')
  })

  it('机制词、QQ 平台与尸体表达按领域词典归并（木乃伊走 alias 链归一到底）', () => {
    expect(extractNouns('QQ空间', '有人在 QQ 空间发帖')).toContain('QQ')
    expect(extractNouns('QQ空间', '有人在 QQ 空间发帖')).not.toContain('QQ空间')
    const corpse = extractNouns('男尸', '河边发现女尸与浮尸，另有干尸一具')
    expect(corpse).toContain('尸体')
    expect(corpse).not.toContain('男尸')
    expect(corpse).not.toContain('女尸')
    expect(corpse).not.toContain('浮尸')
    expect(corpse).not.toContain('干尸')
    expect(corpse).not.toContain('木乃伊')
  })

  it('明朝 / 清朝年号归入对应朝代（嘉靖·永乐·万历→明代，康熙·乾隆→清代）', () => {
    const ming = extractTimes('明永乐年间编纂，嘉靖年间抄录副本，万历帝定陵')
    expect(ming).toContain('明初')   // 永乐
    expect(ming).toContain('明中叶') // 嘉靖 / 万历
    expect(ming).toContain('明代')
    expect(ming).not.toContain('永乐')
    expect(ming).not.toContain('嘉靖')

    const qing = extractTimes('康熙十五年与乾隆下江南，道光十七年洪秀全落榜')
    expect(qing).toContain('清中叶') // 康熙 / 乾隆
    expect(qing).toContain('清末')   // 道光
    expect(qing).toContain('清代')
    expect(qing).not.toContain('康熙')

    // 上位父子期
    expect(timeParentPeriod('明中叶')).toBe('明代')
    expect(timeParentPeriod('明末')).toBe('明代')
  })

  it('新增「实验」「戏剧」关键词，并把 人体实验/戏曲/话剧 归并到上位词', () => {
    expect(extractNouns('神秘实验', '1934年费城富兰克林实验')).toContain('实验')
    const exp = extractNouns('人体实验', '某戏剧团排演话剧与戏曲')
    expect(exp).toContain('实验')
    expect(exp).not.toContain('人体实验')
    expect(exp).toContain('戏剧')
    expect(exp).not.toContain('话剧')
    expect(exp).not.toContain('戏曲')
    const opera = extractNouns('京剧名段', '昆曲与黄梅戏同台')
    expect(opera).toContain('戏剧')
    expect(opera).not.toContain('京剧')
    expect(opera).not.toContain('昆曲')
    expect(opera).not.toContain('黄梅戏')
  })

  it('「梗 / 迷因 / meme」系列统一归并为「模因」（大小写不敏感）', () => {
    const a = extractNouns('经典梗', '这个梗图后来成了网络迷因')
    expect(a).toContain('模因')
    expect(a).not.toContain('梗')
    expect(a).not.toContain('梗图')
    expect(a).not.toContain('迷因')
    const b = extractNouns('Meme', '一个广为流传的 Meme 变体')
    expect(b).toContain('模因')
    expect(b).not.toContain('Meme')
  })

  it('短片归入电影；精神疾病同义词群统一归并为「精神障碍」', () => {
    const film = extractNouns('实验短片', '一部关于都市传说的短片')
    expect(film).toContain('电影')
    expect(film).not.toContain('短片')

    const mental = extractNouns('抑郁症', '患者有精神分裂与焦虑症，另疑双相情感障碍')
    expect(mental).toContain('精神障碍')
    for (const t of ['抑郁症', '精神分裂', '焦虑症', '双相情感障碍', '精神疾病', '自闭症']) {
      expect(mental).not.toContain(t)
    }
  })

  it('「长城别墅」不误抽为地名「长城」；精神病规范词为「精神障碍」；港漫归入漫画', () => {
    const places = extractPlaces('香港旺角洗衣街的长城别墅宾馆发生命案')
    expect(places).not.toContain('长城')
    expect(places).toContain('香港')

    const mental = extractNouns('抑郁症', '患者有精神分裂与焦虑症')
    expect(mental).toContain('精神障碍')
    expect(mental).not.toContain('精神病')
    expect(mental).not.toContain('抑郁症')

    const comic = extractNouns('港漫', '一本港漫杂志')
    expect(comic).toContain('漫画')
    expect(comic).not.toContain('港漫')
  })

  it('月亮类归并；移除深海；「大花鞋鬼船」也归入船舶', () => {
    const moon = extractNouns('指月亮割耳朵', '拜月与月蚀疮，月球上的环形山')
    expect(moon).toContain('月亮')
    for (const t of ['月球', '月', '明月']) expect(moon).not.toContain(t)

    expect(extractNouns('深海', '深海里藏有秘密')).not.toContain('深海')

    const ship = extractNouns('大花鞋鬼船', '用一只红色木船运至深海抛入水中')
    expect(ship).toContain('船舶')
    expect(ship).not.toContain('大花鞋鬼船')
    expect(ship).not.toContain('木船')
  })

  it('船舶类与张贴物类同义词归并', () => {
    const ship = extractNouns('幽灵船', '一艘古代帆船样式的船，另有渔船与轮船')
    expect(ship).toContain('船舶')
    for (const t of ['幽灵船', '帆船', '渔船', '轮船', '船只']) expect(ship).not.toContain(t)

    const notice = extractNouns('寻人启事', '电视台插播的寻人启事，另有寻物启事与告示')
    expect(notice).toContain('张贴物')
    for (const t of ['寻人启事', '寻物启事', '告示', '启事']) expect(notice).not.toContain(t)
  })

  it('航空 / 新闻 / 艺术 / 灭绝 关键词与通灵·虎·照片归并', () => {
    const air = extractNouns('航班', '飞机在机场降落')
    expect(air).toContain('航空')
    expect(air).not.toContain('航班')
    expect(air).not.toContain('机场')

    const misc = extractNouns('新闻', '一则艺术展览与物种灭绝的报道')
    expect(misc).toContain('新闻')
    expect(misc).toContain('艺术')
    expect(misc).toContain('灭绝')

    const seance = extractNouns('通灵', '笔仙碟仙与扶乩都是通灵游戏')
    expect(seance).toContain('通灵')
    expect(seance).not.toContain('笔仙')
    expect(seance).not.toContain('碟仙')
    expect(seance).not.toContain('通灵游戏')

    const tiger = extractNouns('华南虎照片事件', '宣称拍摄到野生华南虎')
    expect(tiger).toContain('虎')
    expect(tiger).not.toContain('华南虎')

    const photo = extractNouns('胶片', '一卷老胶片')
    expect(photo).toContain('照片')
    expect(photo).not.toContain('胶片')
  })

  it('extractPlatforms：平台、具体贴吧名（xx吧）与吧友/吧主泛指都归到贴吧', () => {
    expect(extractPlatforms('2010年6月13日，百度贴吧账号“X来自未来”发帖')).toContain('贴吧')
    expect(extractPlatforms('该组织的推动作用甚至超过了“2012吧”与“一的法则吧”')).toContain('贴吧')
    expect(extractPlatforms('都市传说吧吧主叶辰渊曾对此事进行辟谣')).toContain('贴吧')
    expect(extractPlatforms('而后经寻找，一海虎吧吧友认为该片为1974年的动画')).toContain('贴吧')
    const both = extractPlatforms('据都市传说吧和 B 站的研究者分析')
    expect(both).toContain('贴吧')
    expect(both).toContain('B站')
    // 语气词/无关复合词不触发
    expect(extractPlatforms('让我们先从乾隆下江南开始吧')).not.toContain('贴吧')
    expect(extractPlatforms('这家纽约酒吧曾经涉黑')).not.toContain('贴吧')
  })

  it('extractEntryEntities 与实体列表序列化往返一致', () => {
    const ent = extractEntryEntities('双鱼玉佩', '上世纪80年代罗布泊新疆科研事件与克隆假说')
    expect(ent.places).toContain('罗布泊')
    expect(ent.places).toContain('新疆')
    expect(ent.times).toContain('1980年代')
    expect(ent.nouns).toContain('克隆')

    const formatted = formatEntityList(ent.places)
    expect(parseEntityList(formatted)).toEqual(ent.places)
    expect(parseEntityList('')).toEqual([])
  })
})
