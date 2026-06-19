import { describe, it, expect } from 'vitest'
import { parse1CClientBankExchange } from './bankImport'

const OUR = '40802810000000000001'

function stmt(purpose: string): string {
  return [
    '1CClientBankExchange',
    'СекцияДокумент=Платежное поручение',
    'Номер=5',
    'Дата=09.06.2026',
    'Сумма=12000.00',
    'Плательщик=ООО Ромашка',
    'ПлательщикСчет=40702810000000000999',
    'Получатель=ИП Иванов',
    `ПолучательСчет=${OUR}`,
    `НазначениеПлатежа=${purpose}`,
    'КонецДокумента',
  ].join('\r\n')
}

describe('bankImport: определение НДС из назначения платежа', () => {
  it('«в т.ч. НДС 20%» → ставка 20', () => {
    const { ops } = parse1CClientBankExchange(stmt('Оплата по счёту 5, в т.ч. НДС 20% 2000.00'), OUR)
    expect(ops).toHaveLength(1)
    expect(ops[0].vat).toBe('20')
    expect(ops[0].kind).toBe('income')
  })

  it('«включая НДС 5 %» → ставка 5', () => {
    const { ops } = parse1CClientBankExchange(stmt('Услуги, включая НДС 5 % 571.43'), OUR)
    expect(ops[0].vat).toBe('5')
  })

  it('«Без НДС» → ставка не выставляется', () => {
    const { ops } = parse1CClientBankExchange(stmt('Оплата по договору. Без НДС'), OUR)
    expect(ops[0].vat).toBeUndefined()
  })

  it('«НДС не облагается» → ставка не выставляется', () => {
    const { ops } = parse1CClientBankExchange(stmt('Перевод. НДС не облагается'), OUR)
    expect(ops[0].vat).toBeUndefined()
  })

  it('нет упоминания НДС → ставка не выставляется', () => {
    const { ops } = parse1CClientBankExchange(stmt('Возврат займа'), OUR)
    expect(ops[0].vat).toBeUndefined()
  })

  it('нестандартная ставка (НДС 18%) игнорируется (нет в списке)', () => {
    const { ops } = parse1CClientBankExchange(stmt('Старый счёт, в т.ч. НДС 18% 1830.51'), OUR)
    expect(ops[0].vat).toBeUndefined()
  })
})
