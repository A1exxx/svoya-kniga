/**
 * Флаги полуавтоматических функций (Горизонт 1–2). ПО УМОЛЧАНИЮ ВЫКЛЮЧЕНЫ.
 * Включаются в «Настройках». Режим «ассистент»: система ПОДСКАЗЫВАЕТ заполнение и находит
 * аномалии, но НЕ действует сама — решение всегда подтверждает человек.
 */
import { persistKey } from '../storage/idb'

export interface AutomationSettings {
  /** H1: подсказки заполнения операций по истории контрагента. */
  autofill: boolean
  /** H2: инсайты — аномалии, дубли, дебиторка, прогноз дохода. */
  insights: boolean
}

const KEY = 'svoyakniga.automation.v1'
const DEFAULTS: AutomationSettings = { autofill: false, insights: false }

export function getAutomationSettings(): AutomationSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AutomationSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setAutomationFlag(key: keyof AutomationSettings, value: boolean): void {
  const next = { ...getAutomationSettings(), [key]: value }
  persistKey(KEY, JSON.stringify(next))
  try {
    window.dispatchEvent(new CustomEvent('svk:automation-change'))
  } catch {
    /* нет window */
  }
}
