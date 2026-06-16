import { useEffect, useState } from 'react'
import { YEARS } from '../lib/taxcore'
import { NUM_FIELDS, type NumField, hasOverride, resetYear, setOverride } from '../state/paramsStore'
import { useOrg } from '../state/orgStore'
import { Card, Field, Note, inputClass } from '../components/ui'

const YEARS_LIST = [2024, 2025, 2026]

const FIELD_INFO: Record<NumField, { label: string; kind: 'money' | 'percent'; why: string }> = {
  fixed_contributions: {
    label: 'Фиксированные взносы ИП «за себя»',
    kind: 'money',
    why: 'Единая сумма за год (ОПС + ОМС). Установлена ст. 430 НК РФ заранее на несколько лет. Платится даже при нулевом доходе.',
  },
  income_threshold_1pct: {
    label: 'Порог дохода для доп. взноса 1%',
    kind: 'money',
    why: 'Сумма, свыше которой начисляется дополнительный взнос 1%. Сейчас 300 000 ₽.',
  },
  rate_1pct: {
    label: 'Ставка дополнительного взноса',
    kind: 'percent',
    why: '1% с дохода свыше порога. Идёт на пенсионное страхование (ОПС).',
  },
  max_variable_contributions: {
    label: 'Потолок переменной части (1%)',
    kind: 'money',
    why: 'Годовой максимум доп. взноса 1% (ст. 430 НК РФ). Ограничивает взносы при большом доходе.',
  },
  usn_income_rate: {
    label: 'Ставка УСН «Доходы»',
    kind: 'percent',
    why: 'Базовая 6%. Регион может снизить (вплоть до 1%) — укажите вашу региональную ставку.',
  },
  usn_income_minus_rate: {
    label: 'Ставка УСН «Доходы минус расходы»',
    kind: 'percent',
    why: 'Базовая 15%. Регион может снизить (вплоть до 5%).',
  },
  usn_min_tax_rate: {
    label: 'Ставка минимального налога',
    kind: 'percent',
    why: '1% от доходов — нижняя граница налога для объекта «Доходы минус расходы» (ст. 346.18 НК РФ).',
  },
}

const GROUPS: { title: string; fields: NumField[] }[] = [
  {
    title: 'Страховые взносы ИП',
    fields: ['fixed_contributions', 'income_threshold_1pct', 'rate_1pct', 'max_variable_contributions'],
  },
  { title: 'Ставки УСН', fields: ['usn_income_rate', 'usn_income_minus_rate', 'usn_min_tax_rate'] },
]

function toDisplay(year: number, f: NumField): string {
  const v = YEARS[year][f].toNumber()
  return FIELD_INFO[f].kind === 'percent' ? String(Number((v * 100).toFixed(4))) : String(v)
}

export function Settings() {
  const { activeOrg, forceRefresh } = useOrg()
  const [year, setYear] = useState(activeOrg.year)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const d: Record<string, string> = {}
    for (const f of NUM_FIELDS) d[f] = toDisplay(year, f)
    setDraft(d)
    setSaved(false)
  }, [year])

  const onSave = () => {
    const fields: Partial<Record<NumField, number>> = {}
    for (const f of NUM_FIELDS) {
      const raw = Number(draft[f])
      if (!Number.isFinite(raw)) continue
      fields[f] = FIELD_INFO[f].kind === 'percent' ? raw / 100 : raw
    }
    setOverride(year, fields)
    forceRefresh() // пересчёт на экранах «Налоги»/«Дашборд»
    setSaved(true)
  }

  const onReset = () => {
    resetYear(year)
    const d: Record<string, string> = {}
    for (const f of NUM_FIELDS) d[f] = toDisplay(year, f)
    setDraft(d)
    forceRefresh()
    setSaved(false)
  }

  const p = YEARS[year]
  const edited = hasOverride(year)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Реквизиты и настройки</h1>
        <p className="mt-1 text-sm text-muted">
          Параметры налогов по годам. Значения по умолчанию — из ст. 430 НК РФ. Можно
          переопределить (например, региональную ставку) — расчёт сразу обновится.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Field label="Год параметров">
          <select
            className={inputClass}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEARS_LIST.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <span
          className={`mt-6 rounded px-2 py-1 text-xs font-medium ${
            p.verified ? 'bg-green-50 text-ok' : 'bg-amber-50 text-warn'
          }`}
        >
          {p.verified ? 'Сверено с НК РФ' : 'Отредактировано — проверьте'}
        </span>
      </div>

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <div className="space-y-4">
              {g.fields.map((f) => {
                const info = FIELD_INFO[f]
                return (
                  <div key={f} className="grid gap-1 sm:grid-cols-[1fr_180px] sm:items-start sm:gap-4">
                    <div>
                      <div className="text-sm font-medium text-ink">{info.label}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted">{info.why}</div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className={`${inputClass} pr-9 text-right`}
                        value={draft[f] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                        {info.kind === 'percent' ? '%' : '₽'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ))}

        <Note tone={p.verified ? 'info' : 'warn'}>
          <strong>Почему такие значения.</strong> {p.note} Источник — официальный текст НК РФ.
          Эти данные меняются ежегодно: при изменении закона обновите их здесь, и все расчёты
          пересчитаются. Финальную корректность подтверждает бухгалтер.
        </Note>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            className="cursor-pointer rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Сохранить параметры
          </button>
          {edited && (
            <button
              type="button"
              onClick={onReset}
              className="cursor-pointer rounded-lg border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-50"
            >
              Сбросить к НК РФ
            </button>
          )}
          {saved && <span className="text-sm text-ok">Сохранено ✓</span>}
        </div>
      </div>
    </div>
  )
}
