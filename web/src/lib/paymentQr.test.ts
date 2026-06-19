/** Тест платёжного QR (ГОСТ Р 56042, ST00012): порядок полей, сумма в копейках. */
import { describe, expect, it } from 'vitest'
import { paymentQrPayload, paymentQrSvg } from './paymentQr.js'
import type { Org } from '../state/orgStore'

const org = {
  fio: 'Логвина Ирина Анатольевна',
  name: 'ИП Логвина',
  inn: '360403769236',
  bankAccount: '40802810213000052038',
  bankName: 'ПАО СБЕРБАНК',
  bik: '042007681',
  corrAccount: '30101810600000000681',
} as unknown as Org

describe('paymentQrPayload — формат ГОСТ Р 56042', () => {
  it('начинается с ST00012 и содержит ключевые поля', () => {
    const p = paymentQrPayload(org, { sum: 278000, purpose: 'Оплата по счёту № 5' })
    expect(p.startsWith('ST00012|')).toBe(true)
    expect(p).toContain('Name=Логвина Ирина Анатольевна')
    expect(p).toContain('PersonalAcc=40802810213000052038')
    expect(p).toContain('BIC=042007681')
    expect(p).toContain('CorrespAcc=30101810600000000681')
    expect(p).toContain('PayeeINN=360403769236')
    // сумма — в копейках
    expect(p).toContain('Sum=27800000')
    expect(p).toContain('Purpose=Оплата по счёту № 5')
  })

  it('пустые реквизиты не попадают в строку', () => {
    const p = paymentQrPayload({ fio: 'ИП Тест' } as unknown as Org, {})
    expect(p).toContain('Name=ИП Тест')
    expect(p).not.toContain('PersonalAcc=')
    expect(p).not.toContain('Sum=')
  })

  it('paymentQrSvg возвращает <svg> для валидных данных', () => {
    const svg = paymentQrSvg(paymentQrPayload(org, { sum: 1000 }))
    expect(svg).toBeTypeOf('string')
    expect(svg as string).toContain('<svg')
  })
})
