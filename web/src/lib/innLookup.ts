/**
 * Автозаполнение реквизитов по ИНН.
 *
 * Источник: DaData suggestions API (findById/party) — бесплатный тариф, работает из
 * браузера с API-ключом. Ключ хранится локально (см. getDadataToken). Без ключа
 * работает встроенный демо-словарь известных ИНН — чтобы автозаполнение можно было
 * попробовать сразу.
 */

export type InnStatus = 'active' | 'liquidating' | 'liquidated' | 'bankrupt' | 'reorganizing'

export interface InnInfo {
  inn: string
  type: 'ul' | 'ip'
  name: string // наименование организации или ФИО ИП
  kpp?: string
  address?: string
  ogrn?: string
  status?: InnStatus
  regDate?: string // YYYY-MM-DD
}

/** Подпись и «светофор» статуса контрагента. */
export function innStatusInfo(status?: InnStatus): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  switch (status) {
    case 'active':
      return { label: 'Действующий', tone: 'ok' }
    case 'reorganizing':
      return { label: 'В процессе реорганизации', tone: 'warn' }
    case 'liquidating':
      return { label: 'В процессе ликвидации', tone: 'warn' }
    case 'bankrupt':
      return { label: 'Банкротство', tone: 'danger' }
    case 'liquidated':
      return { label: 'Ликвидирован', tone: 'danger' }
    default:
      return { label: 'Статус неизвестен', tone: 'warn' }
  }
}

const STATUS_MAP: Record<string, InnStatus> = {
  ACTIVE: 'active',
  LIQUIDATING: 'liquidating',
  LIQUIDATED: 'liquidated',
  BANKRUPT: 'bankrupt',
  REORGANIZING: 'reorganizing',
}

const TOKEN_KEY = 'svoyakniga.dadata.token'

export function getDadataToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setDadataToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim())
  } catch {
    /* ignore */
  }
}

/** Несколько известных ИНН — чтобы автозаполнение работало без ключа (демо). */
const DEMO: Record<string, InnInfo> = {
  '7707083893': {
    inn: '7707083893',
    type: 'ul',
    name: 'ПАО Сбербанк',
    kpp: '773601001',
    ogrn: '1027700132195',
    address: 'г. Москва, ул. Вавилова, д. 19',
  },
  '7736207543': {
    inn: '7736207543',
    type: 'ul',
    name: 'ООО «ЯНДЕКС»',
    kpp: '770401001',
    ogrn: '1027700229193',
    address: 'г. Москва, ул. Льва Толстого, д. 16',
  },
  '7704217370': {
    inn: '7704217370',
    type: 'ul',
    name: 'ООО «ИНТЕРНЕТ РЕШЕНИЯ» (Ozon)',
    kpp: '770401001',
    ogrn: '1027739244741',
    address: 'г. Москва, Пресненская наб., д. 10',
  },
  '7721546864': {
    inn: '7721546864',
    type: 'ul',
    name: 'ООО «ВАЙЛДБЕРРИЗ»',
    kpp: '644901001',
    ogrn: '1067746062449',
    address: 'Московская обл., д. Коледино, тер. Индустриальный Парк Коледино, д. 6, стр. 1',
  },
  '773601001234': {
    inn: '773601001234',
    type: 'ip',
    name: 'ИП Иванов Иван Иванович',
    address: 'г. Москва',
  },
}

/** Корректность контрольной длины ИНН (10 — ЮЛ, 12 — ИП/физлицо). */
export function isValidInnLength(inn: string): boolean {
  const c = inn.replace(/\D/g, '')
  return c.length === 10 || c.length === 12
}

/**
 * Найти реквизиты по ИНН. Сначала демо-словарь, затем DaData (если задан ключ).
 * Возвращает null, если ничего не найдено / ключа нет / ошибка сети.
 */
export async function lookupInn(inn: string): Promise<InnInfo | null> {
  const clean = inn.replace(/\D/g, '')
  if (!isValidInnLength(clean)) return null

  if (DEMO[clean]) return { status: 'active', ...DEMO[clean] }

  const token = getDadataToken()
  if (!token) return null

  try {
    const res = await fetch(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Token ' + token,
        },
        body: JSON.stringify({ query: clean, count: 1 }),
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    const s = json?.suggestions?.[0]
    if (!s) return null
    const d = s.data || {}
    let regDate: string | undefined
    if (d.state?.registration_date) {
      try {
        regDate = new Date(d.state.registration_date).toISOString().slice(0, 10)
      } catch {
        /* ignore */
      }
    }
    return {
      inn: d.inn || clean,
      type: d.type === 'INDIVIDUAL' ? 'ip' : 'ul',
      name: s.value || '',
      kpp: d.kpp || undefined,
      ogrn: d.ogrn || undefined,
      address: d.address?.value || undefined,
      status: d.state?.status ? STATUS_MAP[d.state.status] : undefined,
      regDate,
    }
  } catch {
    return null
  }
}
