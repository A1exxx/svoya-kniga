import { describe, expect, it } from 'vitest'
import { rublesToWords, intToWords, plural } from './numberToWords'

describe('intToWords', () => {
  it('0 → ноль', () => expect(intToWords(0)).toBe('ноль'))
  it('21 → двадцать один', () => expect(intToWords(21)).toBe('двадцать один'))
  it('111 → сто одиннадцать', () => expect(intToWords(111)).toBe('сто одиннадцать'))
  it('21000 → двадцать одна тысяча (женский род)', () =>
    expect(intToWords(21000)).toBe('двадцать одна тысяча'))
  it('2400000 → два миллиона четыреста тысяч', () =>
    expect(intToWords(2_400_000)).toBe('два миллиона четыреста тысяч'))
  it('1002 → одна тысяча два', () => expect(intToWords(1002)).toBe('одна тысяча два'))
})

describe('plural', () => {
  it('1 рубль', () => expect(plural(1, 'рубль', 'рубля', 'рублей')).toBe('рубль'))
  it('2 рубля', () => expect(plural(2, 'рубль', 'рубля', 'рублей')).toBe('рубля'))
  it('5 рублей', () => expect(plural(5, 'рубль', 'рубля', 'рублей')).toBe('рублей'))
  it('11 рублей (особый случай)', () => expect(plural(11, 'рубль', 'рубля', 'рублей')).toBe('рублей'))
  it('21 рубль', () => expect(plural(21, 'рубль', 'рубля', 'рублей')).toBe('рубль'))
})

describe('rublesToWords', () => {
  it('0 → Ноль рублей 00 копеек', () => expect(rublesToWords(0)).toBe('Ноль рублей 00 копеек'))
  it('1 → Один рубль 00 копеек', () => expect(rublesToWords(1)).toBe('Один рубль 00 копеек'))
  it('123.45 → Сто двадцать три рубля 45 копеек', () =>
    expect(rublesToWords(123.45)).toBe('Сто двадцать три рубля 45 копеек'))
  it('2 400 000 → Два миллиона четыреста тысяч рублей 00 копеек', () =>
    expect(rublesToWords(2_400_000)).toBe('Два миллиона четыреста тысяч рублей 00 копеек'))
  it('100000.5 → ... 50 копеек', () =>
    expect(rublesToWords(100_000.5)).toBe('Сто тысяч рублей 50 копеек'))
  it('копейки округляются до 100 → +1 рубль', () =>
    expect(rublesToWords(9.999)).toBe('Десять рублей 00 копеек'))
})
