import { useState } from 'react'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { useOrg } from '../state/orgStore'
import { getParams, type UsnObject } from '../lib/taxcore'
import { Card, Field, Note, Row, inputClass } from '../components/ui'
import { IconCheck, IconClock, IconDoc, IconSend } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { DeclarationDoc } from '../components/DeclarationDoc'
import { SendDemoModal } from '../components/SendDemoModal'
import { declarationUsnXml, declarationFileName } from '../lib/declarationXml'
import { ensNotificationXml, ensFileName } from '../lib/ensXml'
import { EnsNotificationDoc } from '../components/EnsNotificationDoc'
import { downloadText } from '../lib/download'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const YEARS = [2024, 2025, 2026]

const kindIcon = {
  payment: IconClock,
  notification: IconSend,
  report: IconCheck,
} as const

export function Taxes() {
  const { activeOrg, updateActiveOrg } = useOrg()
  const o = activeOrg
  const [modal, setModal] = useState<'decl' | 'ens' | 'send' | null>(null)
  const [sendTitle, setSendTitle] = useState('Декларация по УСН')

  let computed: ReturnType<typeof compute> | null = null
  let error: string | null = null
  try {
    computed = compute(o)
  } catch (e) {
    error = (e as Error).message
  }

  const params = (() => {
    try {
      return getParams(o.year)
    } catch {
      return null
    }
  })()

  const isIncome = o.usnObject === 'income'

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{o.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Налоги</h1>
        <p className="mt-1 text-sm text-muted">
          Расчёт УСН, страховых взносов ИП и сроков. Все суммы пересчитываются мгновенно.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* ---- Ввод данных ---- */}
        <div className="space-y-5">
          <Card title="Исходные данные">
            <div className="space-y-4">
              <Field label="Налоговый год">
                <select
                  className={inputClass}
                  value={o.year}
                  onChange={(e) => updateActiveOrg({ year: Number(e.target.value) })}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Объект налогообложения">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['income', 'Доходы 6%'],
                      ['income_minus', 'Д − Р 15%'],
                    ] as [UsnObject, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateActiveOrg({ usnObject: val })}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        o.usnObject === val
                          ? 'border-brand-500 bg-brand-50 text-brand-600'
                          : 'border-line text-muted hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Годовой доход" hint={formatRub(o.income)}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={o.income}
                  onChange={(e) => updateActiveOrg({ income: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>

              {!isIncome && (
                <Field label="Годовые расходы" hint={formatRub(o.expenses)}>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={o.expenses}
                    onChange={(e) =>
                      updateActiveOrg({ expenses: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </Field>
              )}

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                  checked={o.hasEmployees}
                  onChange={(e) => updateActiveOrg({ hasEmployees: e.target.checked })}
                />
                <span className="text-sm text-ink">Есть наёмные работники</span>
              </label>
            </div>
          </Card>

          {params && (
            <Note tone={params.verified ? 'info' : 'warn'}>
              Параметры {o.year} года: {params.note}
            </Note>
          )}
        </div>

        {/* ---- Результат ---- */}
        <div className="space-y-5">
          {error && <Note tone="warn">Ошибка расчёта: {error}</Note>}

          {computed && (
            <>
              <Card>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted">Налог УСН за год</div>
                    <div className="tnum mt-1 text-4xl font-semibold text-ink">
                      {dec(computed.usn.tax_year_final)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted">Страховые взносы ИП</div>
                    <div className="tnum mt-1 text-2xl font-semibold text-brand-600">
                      {dec(computed.contr.total)}
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Как посчитан налог">
                {isIncome ? (
                  <>
                    <Row
                      label="Налог по ставке"
                      hint={`${computed.usn.rate.times(100).toNumber()}% от дохода`}
                      value={dec(computed.usn.periods[0].tax_before_deduction_cumulative)}
                    />
                    <Row
                      label="− Вычет страховых взносов"
                      hint={o.hasEmployees ? 'не более 50% налога' : 'до 100%'}
                      value={dec(computed.usn.periods[0].deduction_cumulative)}
                    />
                    <Row label="= Налог УСН к уплате" value={dec(computed.usn.tax_year_final)} strong />
                  </>
                ) : (
                  <>
                    <Row
                      label="Налог по ставке"
                      hint={`${computed.usn.rate.times(100).toNumber()}% от (доходы − расходы)`}
                      value={dec(computed.usn.tax_year_computed)}
                    />
                    <Row label="Минимальный налог" hint="1% от доходов" value={dec(computed.usn.min_tax)} />
                    <Row
                      label="= К уплате (больший из двух)"
                      value={dec(computed.usn.tax_year_final)}
                      strong
                    />
                  </>
                )}
                {computed.usn.notes.map((n, i) => (
                  <p key={i} className="mt-3 text-xs text-muted">
                    {n}
                  </p>
                ))}
              </Card>

              <Card title="Страховые взносы «за себя»">
                <Row
                  label="Фиксированные"
                  hint={`до ${formatDate(computed.contr.fixed_due)}`}
                  value={dec(computed.contr.fixed)}
                />
                <Row
                  label="1% с дохода свыше 300 000 ₽"
                  hint={`до ${formatDate(computed.contr.one_percent_due)}`}
                  value={dec(computed.contr.one_percent)}
                />
                <Row label="Итого взносов" value={dec(computed.contr.total)} strong />
              </Card>

              <Card title="Налоговый календарь">
                <div className="space-y-1">
                  {computed.calendar.map((e, i) => {
                    const Icon = kindIcon[e.kind]
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                      >
                        <span className="tnum w-20 shrink-0 text-xs text-muted">{formatDate(e.due)}</span>
                        <Icon size={16} className="shrink-0 text-slate-400" />
                        <span className="flex-1 text-sm text-ink">{e.title}</span>
                        <span className="tnum whitespace-nowrap text-sm font-medium text-ink">
                          {dec(e.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card title="Отчётность и отправка">
                <div className="text-sm font-medium text-ink">Декларация по УСН за {o.year}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setModal('decl')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <IconCheck size={16} className="text-brand-600" />
                    Печать / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(declarationFileName(o), declarationUsnXml(o, computed!), 'application/xml;charset=utf-8')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <IconDoc size={16} className="text-brand-600" />
                    Скачать XML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendTitle(`Декларация по УСН за ${o.year}`)
                      setModal('send')
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    <IconSend size={16} />
                    Подписать и отправить
                  </button>
                </div>

                <div className="mt-4 text-sm font-medium text-ink">Уведомление ЕНС (КНД 1110355)</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setModal('ens')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <IconCheck size={16} className="text-brand-600" />
                    Печать / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(ensFileName(o), ensNotificationXml(o, computed!), 'application/xml;charset=utf-8')}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <IconDoc size={16} className="text-brand-600" />
                    Скачать XML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendTitle('Уведомление об исчисленных суммах (ЕНС)')
                      setModal('send')
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    <IconSend size={16} />
                    Подписать и отправить
                  </button>
                </div>

                <p className="mt-3 text-xs text-muted">
                  Документы можно распечатать, сохранить в PDF или выгрузить в XML (формат ФНС).
                  Подписание КЭП и отправка — пока имитация процесса; реальная сдача (через шлюз ФНС
                  или оператора ЭДО) появится позже.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>

      {modal === 'decl' && computed && (
        <PrintModal title="Декларация по УСН — предпросмотр" onClose={() => setModal(null)}>
          <DeclarationDoc org={o} computed={computed} />
        </PrintModal>
      )}
      {modal === 'ens' && computed && (
        <PrintModal title="Уведомление ЕНС — предпросмотр" onClose={() => setModal(null)}>
          <EnsNotificationDoc org={o} computed={computed} />
        </PrintModal>
      )}
      {modal === 'send' && <SendDemoModal docTitle={sendTitle} onClose={() => setModal(null)} />}
    </div>
  )
}
