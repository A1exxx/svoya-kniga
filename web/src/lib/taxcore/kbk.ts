/**
 * Справочник КБК (коды бюджетной классификации) для уведомлений об исчисленных суммах
 * и платежей. Значения на 2025–2026 (источники: приказы Минфина; v2b.ru, nalog-nalog.ru).
 * ⚠️ КБК меняются — перед реальной сдачей сверять с актуальным справочником.
 */

export interface KbkSet {
  /** НДФЛ по ступеням прогрессии (по доходу) */
  ndfl13: string
  ndfl15: string
  ndfl18: string
  ndfl20: string
  ndfl22: string
  /** Единый тариф страховых взносов за работников */
  vznosyEmployees: string
  /** Взносы на травматизм (СФР) */
  travmatizm: string
  /** Фиксированные взносы ИП «за себя» */
  vznosyIpFixed: string
  /** 1% с дохода свыше 300 000 ₽ */
  vznosyIp1pct: string
  /** УСН «доходы» */
  usnIncome: string
  /** УСН «доходы минус расходы» */
  usnIncomeMinus: string
}

const KBK_2026: KbkSet = {
  ndfl13: '18210102010011000110',
  ndfl15: '18210102080011000110',
  ndfl18: '18210102150011000110',
  ndfl20: '18210102160011000110',
  ndfl22: '18210102170011000110',
  vznosyEmployees: '18210201000011000160',
  travmatizm: '79710212000061000160',
  vznosyIpFixed: '18210202000011000160',
  vznosyIp1pct: '18210203000011000160',
  usnIncome: '18210501011011000110',
  usnIncomeMinus: '18210501021011000110',
}

/** КБК за год (на 2025/2026 совпадают). */
export function getKbk(_year: number): KbkSet {
  return KBK_2026
}

/** КБК НДФЛ по ставке (%). */
export function ndflKbk(ratePct: number, year = 2026): string {
  const k = getKbk(year)
  if (ratePct <= 13) return k.ndfl13
  if (ratePct <= 15) return k.ndfl15
  if (ratePct <= 18) return k.ndfl18
  if (ratePct <= 20) return k.ndfl20
  return k.ndfl22
}

/** КБК УСН по объекту. */
export function usnKbk(usnObject: 'income' | 'income_minus', year = 2026): string {
  const k = getKbk(year)
  return usnObject === 'income' ? k.usnIncome : k.usnIncomeMinus
}
