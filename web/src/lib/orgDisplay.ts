import type { Org } from '../state/orgStore'

/** Плейсхолдерные «краткие названия», которые не стоит показывать как имя ИП. */
const PLACEHOLDER_NAMES = new Set(['', 'Новый ИП', 'ИП Демонстрация'])

/**
 * Человекочитаемое имя организации для списков и переключателя ИП.
 * Если «Краткое название» не задано или осталось плейсхолдером — выводим
 * «ИП {ФИО}», иначе «ИП {ИНН}», иначе «Без названия».
 * Это решает жалобу «ввела ИП, а в списке его не видно» — список всегда
 * показывает осмысленную подпись, даже если поле name бухгалтер не заполнил.
 */
export function orgDisplayName(o: Pick<Org, 'name' | 'fio' | 'inn'>): string {
  const name = (o.name ?? '').trim()
  if (name && !PLACEHOLDER_NAMES.has(name)) return name
  const fio = (o.fio ?? '').trim()
  if (fio) {
    const low = fio.toLowerCase()
    const hasIpPrefix = low === 'ип' || low.startsWith('ип ') || low.startsWith('ип.')
    return hasIpPrefix ? fio : `ИП ${fio}`
  }
  const inn = (o.inn ?? '').trim()
  if (inn) return `ИП ${inn}`
  // Нет ни ФИО, ни ИНН — показываем хотя бы исходное имя (даже плейсхолдер), иначе «Без названия».
  return name || 'Без названия'
}

/** Является ли текущее «краткое название» плейсхолдером (можно безопасно перезаписать). */
export function isPlaceholderName(name: string | undefined | null): boolean {
  return PLACEHOLDER_NAMES.has((name ?? '').trim())
}

/** Ключевые реквизиты ИП, по заполненности которых считаем «готовность». */
const KEY_FIELDS: { key: keyof Org; label: string }[] = [
  { key: 'fio', label: 'ФИО предпринимателя' },
  { key: 'inn', label: 'ИНН' },
  { key: 'ogrnip', label: 'ОГРНИП' },
  { key: 'regDate', label: 'Дата регистрации' },
  { key: 'address', label: 'Адрес' },
  { key: 'okved', label: 'ОКВЭД' },
]

/** Прогресс заполнения реквизитов: сколько ключевых полей заполнено и каких не хватает. */
export function requisitesProgress(o: Org): { filled: number; total: number; missing: string[] } {
  const missing: string[] = []
  for (const f of KEY_FIELDS) {
    const v = o[f.key]
    const empty = typeof v === 'string' ? v.trim() === '' : v == null
    if (empty) missing.push(f.label)
  }
  return { filled: KEY_FIELDS.length - missing.length, total: KEY_FIELDS.length, missing }
}

/** Заполнены ли все ключевые реквизиты (для галочки ✓ в списке ИП). */
export function requisitesComplete(o: Org): boolean {
  return requisitesProgress(o).missing.length === 0
}
