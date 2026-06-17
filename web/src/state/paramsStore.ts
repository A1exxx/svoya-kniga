/**
 * Локальные правки параметров налогов (в браузере), влияющие на расчёт.
 *
 * Значения по умолчанию берутся из ст. 430 НК РФ (taxcore/params.ts). Пользователь/бухгалтер
 * может их переопределить — например, при изменении закона или региональной ставке.
 * Правки хранятся в localStorage и применяются к YEARS при старте приложения.
 * Отредактированный вручную год помечается verified=false (требует проверки).
 */
import Decimal from 'decimal.js'
import { YEARS } from '../lib/taxcore'
import { persistKey } from '../lib/storage/idb'

const KEY = 'svoyakniga.paramOverrides.v1'

export const NUM_FIELDS = [
  'fixed_contributions',
  'income_threshold_1pct',
  'rate_1pct',
  'max_variable_contributions',
  'usn_income_rate',
  'usn_income_minus_rate',
  'usn_min_tax_rate',
] as const
export type NumField = (typeof NUM_FIELDS)[number]
type Overrides = Record<string, Partial<Record<NumField, number>>>

// Снимок значений по умолчанию (ДО применения правок) — для сброса.
const DEFAULTS: Record<number, Record<NumField, number>> = {}
for (const [y, p] of Object.entries(YEARS)) {
  const rec = {} as Record<NumField, number>
  for (const f of NUM_FIELDS) rec[f] = (p[f] as Decimal).toNumber()
  DEFAULTS[Number(y)] = rec
}

function load(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Overrides
  } catch {
    return {}
  }
}
function persist(o: Overrides) {
  // Через persistKey — зеркалируется в IndexedDB. Иначе при очистке localStorage правки ставок
  // налога молча терялись бы и расчёт тихо вернулся бы к дефолтам ст.430 НК.
  persistKey(KEY, JSON.stringify(o))
}

function applyYear(year: number, fields: Partial<Record<NumField, number>>) {
  const p = YEARS[year]
  if (!p) return
  let changed = false
  for (const f of NUM_FIELDS) {
    const v = fields[f]
    if (v == null || !Number.isFinite(v)) continue
    p[f] = new Decimal(v)
    changed = true
  }
  if (changed) p.verified = false
}

/** Применить сохранённые правки к YEARS — вызывать один раз при старте. */
export function applyOverrides() {
  const o = load()
  for (const [y, fields] of Object.entries(o)) applyYear(Number(y), fields)
}

/** Сохранить и применить правки за год. */
export function setOverride(year: number, fields: Partial<Record<NumField, number>>) {
  const o = load()
  o[year] = { ...(o[year] || {}), ...fields }
  persist(o)
  applyYear(year, fields)
}

/** Сбросить год к значениям по умолчанию (ст. 430 НК). */
export function resetYear(year: number) {
  const o = load()
  delete o[String(year)]
  persist(o)
  const def = DEFAULTS[year]
  const p = YEARS[year]
  if (!def || !p) return
  for (const f of NUM_FIELDS) p[f] = new Decimal(def[f])
  p.verified = true
}

/** Есть ли локальные правки за год. */
export function hasOverride(year: number): boolean {
  const o = load()
  return Boolean(o[String(year)] && Object.keys(o[String(year)]).length)
}
