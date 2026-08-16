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
})
