import { describe, expect, it } from 'vitest'
import { parseCSV } from './csv'

describe('parseCSV', () => {
  it('解析表头与数据行', () => {
    const rows = parseCSV('date,year,title\n01-01,2020,元旦\n02-02,2021,二月二')
    expect(rows).toEqual([
      { date: '01-01', year: '2020', title: '元旦' },
      { date: '02-02', year: '2021', title: '二月二' },
    ])
  })

  it('空输入返回空数组', () => {
    expect(parseCSV('')).toEqual([])
    expect(parseCSV('   ')).toEqual([])
  })

  it('只有表头（无数据行）返回空数组', () => {
    expect(parseCSV('a,b,c\n')).toEqual([])
  })

  it('跳过空行并 trim 字段', () => {
    const rows = parseCSV('a,b\n 1 , 2 \n\n3,4\n')
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('短行缺列补空字符串', () => {
    const rows = parseCSV('a,b,c\n1,2')
    expect(rows).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('引号内的逗号不当分隔符', () => {
    expect(parseCSV('a,b\n"x,y",2')).toEqual([{ a: 'x,y', b: '2' }])
  })

  it('引号内的换行不切行（Supabase 导出的 note/描述会这样）', () => {
    const rows = parseCSV('id,note,url\n1,"第一行\n第二行",https://a.example')
    expect(rows).toEqual([{ id: '1', note: '第一行\n第二行', url: 'https://a.example' }])
  })

  it('引号内的 "" 还原为字面引号，JSON 值（changes）可安全承载', () => {
    const rows = parseCSV('id,changes\n9,"{""link"": ""https://a.example"", ""desc"": ""含,逗号""}"')
    expect(JSON.parse(rows[0].changes)).toEqual({ link: 'https://a.example', desc: '含,逗号' })
  })

  it('CRLF 与 BOM 都能吃下', () => {
    const rows = parseCSV('\uFEFFa,b\r\n1,2\r\n"多\r\n行",4\r\n')
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '多\n行', b: '4' }])
  })

  it('字段中间的引号是普通字符（不再吞掉后续内容）', () => {
    expect(parseCSV('a\n他说"你好"')).toEqual([{ a: '他说"你好"' }])
  })
})
