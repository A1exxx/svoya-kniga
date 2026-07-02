/**
 * Сравнение вариантов ставки НДС на УСН (2026): спец-ставка 5%/7% БЕЗ вычета
 * входного НДС против общей ставки (22%) С вычетом. Это ПОДСКАЗКА для выбора
 * (ст. 164 НК РФ), а не расчёт обязательства — обязательства считает vat.ts.
 *
 * Модель: НДС «в том числе» в выручке. К уплате = выручка×r/(100+r) − вычет
 * (вычет только на общей ставке). Спец-ставка фиксируется на 12 кварталов —
 * решение стоит принимать по году, показываем и предупреждаем.
 */
import Decimal from 'decimal.js'
import { getParams } from './taxcore'

export interface VatOption {
  mode: 'rate5' | 'rate7' | 'general'
  rate: number
  vatDue: number // НДС к уплате за год
  note: string
}

export interface VatChoice {
  options: VatOption[]
  best: VatOption
}

/**
 * @param year налоговый год (ставка general берётся из параметров года)
 * @param revenue выручка за год (с НДС «в том числе»)
 * @param inputVat входной НДС за год (из счетов-фактур поставщиков) — вычет на общей ставке
 */
export function compareVatOptions(year: number, revenue: number, inputVat: number): VatChoice {
  const general = getParams(year).vat_general_rate.toNumber()
  const rev = new Decimal(revenue)
  const due = (r: number) => rev.times(r).div(100 + r).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

  const options: VatOption[] = [
    {
      mode: 'rate5',
      rate: 5,
      vatDue: due(5).toNumber(),
      note: 'без вычета входного НДС; доход до 250–272,5 млн',
    },
    {
      mode: 'rate7',
      rate: 7,
      vatDue: due(7).toNumber(),
      note: 'без вычета входного НДС; доход до 450–490,5 млн',
    },
    {
      mode: 'general',
      rate: general,
      vatDue: Decimal.max(due(general).minus(inputVat), new Decimal(0)).toNumber(),
      note: 'с вычетом входного НДС по счетам-фактурам поставщиков',
    },
  ]
  const best = options.reduce((a, b) => (b.vatDue < a.vatDue ? b : a))
  return { options, best }
}
