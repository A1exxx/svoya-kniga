/** Тесты проративности взносов — паритет с test_proration.py. */
import { describe, expect, it } from 'vitest'
import { calcContributions } from './vznosy.js'

describe('взносы — проративность по дате регистрации', () => {
  it('полный год — без проративности (57 390)', () => {
    expect(calcContributions(2026, 1_000_000).fixed.toNumber()).toBe(57_390)
  })

  it('регистрация 1 июля → половина (28 695)', () => {
    const r = calcContributions(2026, 1_000_000, undefined, 'income', { regDate: '2026-07-01' })
    expect(r.fixed.toNumber()).toBe(28_695)
    expect(r.one_percent.toNumber()).toBe(7_000)
    expect(r.total.toNumber()).toBe(35_695)
  })

  it('дата регистрации в прошлом году → полный год', () => {
    const r = calcContributions(2026, 500_000, undefined, 'income', { regDate: '2024-03-01' })
    expect(r.fixed.toNumber()).toBe(57_390)
  })

  it('закрытие 30 июня → половина (28 695)', () => {
    const r = calcContributions(2026, 1_000_000, undefined, 'income', { closeDate: '2026-06-30' })
    expect(r.fixed.toNumber()).toBe(28_695)
  })
})
