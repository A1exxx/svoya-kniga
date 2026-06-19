import type { Org } from '../state/orgStore'
import type { Computed } from '../lib/compute'
import { Cells, OfficialTop, OfficialNote } from './officialForm'

/** Код страницы под штрих-кодом (как в эталонном бланке КНД 1110355). */
const PAGE1 = '2630 2010'
const PAGE2 = '2630 2027'

interface ObRow {
  kbk: string
  oktmo: string
  periodCode: string // напр. «34»
  periodNum: string // напр. «01»
  year: string
  amount: number | null
}

const numOf = (a: number | { toNumber: () => number } | null | undefined): number | null =>
  a == null ? null : typeof a === 'number' ? a : a.toNumber()

/**
 * Уведомление об исчисленных суммах налогов (КНД 1110355) — точная 2-страничная
 * клеточная форма по официальному бланку ФНС (эталон: выгрузка Контур.Эльбы).
 */
export function EnsNotificationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const kbk = isIncome ? '18210501011011000110' : '18210501021011000110'
  const yr = String(org.year)

  // Уведомление подаётся по квартальным авансам УСН (34/01, 34/02, 34/03).
  const rows: ObRow[] = computed.calendar
    .filter((e) => e.kind === 'notification' && e.title.includes('аванс') && numOf(e.amount) != null)
    .map((e, i) => ({
      kbk,
      oktmo: org.oktmo || '',
      periodCode: '34',
      periodNum: ['01', '02', '03'][i] ?? '00',
      year: yr,
      amount: numOf(e.amount),
    }))

  const pages = Math.max(2, Math.ceil(rows.length / 4) + 1)
  const fio = (org.fio || '').trim().split(/\s+/)
  const [lastName = '', firstName = '', patronymic = ''] = fio

  const cell =
    'inline-flex h-5 w-[13px] items-center justify-center border border-slate-400 text-[11px] leading-none'
  const lbl = 'text-[11px] text-slate-600'

  // ОКТМО: 8 значащих + 3 «прочерка» = 11 клеток (как в бланке).
  const oktmoStr = (o: string) => (o.length >= 11 ? o.slice(0, 11) : (o.slice(0, 8) + '---'))
  const sumParts = (a: number | null) => {
    if (a == null) return { rub: '', kop: '' }
    const rub = String(Math.trunc(a))
    const kop = String(Math.round((a - Math.trunc(a)) * 100)).padStart(2, '0')
    return { rub, kop }
  }

  return (
    <div className="text-[12px]">
      {/* ───────── Страница 001 (титульный лист) ───────── */}
      <OfficialTop code={PAGE1} inn={org.inn} kpp="" page="001" />

      <div className="text-[10px] text-slate-500">Форма по КНД 1110355</div>
      <div className="mt-1 text-center text-sm font-semibold leading-snug">
        Уведомление
        <div className="text-[11px] font-normal">
          об исчисленных суммах налогов, авансовых платежей по налогам, сборов, страховых взносов
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        <span className={lbl}>Представляется в налоговый орган (код)</span>
        <Cells value={org.taxOfficeCode} count={4} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={lbl}>Уведомление составлено на</span>
        <Cells value={String(pages).padStart(3, '0')} count={3} />
        <span className={lbl}>страницах с приложением подтверждающих документов или их копий на</span>
        <Cells count={3} />
        <span className={lbl}>листах</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {/* Левая колонка — подтверждение и ФИО */}
        <div className="rounded border border-slate-300 p-2">
          <div className="flex gap-2">
            <span className={cell}>1</span>
            <div className="text-[10px] leading-tight text-slate-600">
              Достоверность и полноту сведений, указанных в настоящем уведомлении, подтверждаю:
              <div>1 — налогоплательщик; 2 — представитель налогоплательщика</div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex flex-wrap gap-[2px]">
              {Array.from({ length: 20 }, (_, i) => (
                <span key={i} className={cell}>
                  {lastName[i] ?? ''}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-[2px]">
              {Array.from({ length: 20 }, (_, i) => (
                <span key={i} className={cell}>
                  {firstName[i] ?? ''}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-[2px]">
              {Array.from({ length: 20 }, (_, i) => (
                <span key={i} className={cell}>
                  {patronymic[i] ?? ''}
                </span>
              ))}
            </div>
            <div className="text-[9px] leading-tight text-slate-400">
              (фамилия, имя, отчество руководителя организации (индивидуального предпринимателя) либо
              представителя)
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className={lbl}>Подпись ____________</span>
            <span className="flex items-center gap-1">
              <span className={lbl}>Дата</span>
              <Cells count={8} />
            </span>
          </div>
        </div>

        {/* Правая колонка — заполняется налоговым органом */}
        <div className="rounded border border-slate-300 p-2 text-[10px] text-slate-500">
          <div className="text-center font-semibold text-slate-600">
            Заполняется работником налогового органа
          </div>
          <div className="mt-1">Сведения о представлении уведомления</div>
          <div className="mt-2 flex items-center gap-1">
            Представлено (код) <Cells count={3} />
          </div>
          <div className="mt-2 flex items-center gap-1">
            на <Cells count={3} /> страницах
          </div>
          <div className="mt-2 flex items-center gap-1">
            Дата представления <Cells count={2} />.<Cells count={2} />.<Cells count={4} />
          </div>
          <div className="mt-6">_______________ &nbsp; _______________</div>
          <div className="flex justify-between">
            <span>Фамилия, И.О.</span>
            <span>Подпись</span>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[9px] text-slate-400">Отчество указывается при наличии.</div>

      {/* ───────── Страница 002 (данные) ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code={PAGE2} inn={org.inn} kpp="" page="002" />
        <div className="mb-2 text-center text-sm font-semibold">Данные</div>

        {rows.length === 0 ? (
          <div className="rounded border border-slate-300 p-3 text-[11px] text-slate-500">
            Поквартальные авансы не рассчитаны — данных для уведомления нет. Внесите доходы по датам
            в «Деньгах» (1 кв / полугодие / 9 месяцев). Годовой налог подаётся декларацией.
          </div>
        ) : (
          <div className="space-y-0">
            {rows.map((r, i) => {
              const sp = sumParts(r.amount)
              return (
                <div key={i} className="border border-slate-400 p-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>
                        1. КПП, указанный в соответствующей налоговой декларации (расчёте)
                      </span>
                      <Cells count={9} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>2. Код по ОКТМО</span>
                      <Cells value={oktmoStr(r.oktmo)} count={11} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>3. Код бюджетной классификации</span>
                      <Cells value={r.kbk} count={20} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>
                        4. Сумма налога, авансовых платежей по налогу, сбора, страховых взносов
                      </span>
                      <span className="flex items-center gap-1">
                        <Cells value={sp.rub.padStart(13, ' ')} count={13} />
                        <span className="font-semibold">.</span>
                        <Cells value={sp.kop} count={2} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>
                        5. Отчётный (налоговый) период (код) / Номер месяца (квартала)
                      </span>
                      <span className="flex items-center gap-1">
                        <Cells value={r.periodCode} count={2} />
                        <span>/</span>
                        <Cells value={r.periodNum} count={2} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={lbl}>6. Отчётный (календарный) год</span>
                      <Cells value={r.year} count={4} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-2 text-[9px] leading-tight text-slate-400">
          Сумма указывается в рублях и копейках по соответствующим сроку и КБК. Заполняется
          необходимое количество листов.
        </div>
      </div>

      <OfficialNote />
    </div>
  )
}
