import { useState } from 'react'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { useOrg, type OrgVatMode } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { getParams, calcVatUsn, calcOsnoIp, calcContributions, type UsnObject } from '../lib/taxcore'
import { compareVatOptions } from '../lib/vatChoice'
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
  const { ops } = useOps()
  const o = activeOrg
  const [modal, setModal] = useState<'decl' | 'ens' | 'send' | null>(null)
  const [sendTitle, setSendTitle] = useState('Декларация по УСН')

  let computed: ReturnType<typeof compute> | null = null
  let error: string | null = null
  try {
    computed = compute(o, ops)
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
  const isOsno = o.taxSystem === 'osno'

  // ОСНО: доходы/расходы из операций «Денег» за год (если есть) или ручной ввод.
  const yearTaxOps = ops.filter((op) => op.taxable && op.date.startsWith(String(o.year)))
  const osnoIncome = yearTaxOps.length
    ? yearTaxOps.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0)
    : o.income
  const osnoExpenses = yearTaxOps.length
    ? yearTaxOps.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0)
    : o.expenses
  let osnoRes: ReturnType<typeof calcOsnoIp> | null = null
  let osnoContr: ReturnType<typeof calcContributions> | null = null
  if (isOsno) {
    try {
      osnoRes = calcOsnoIp(o.year, osnoIncome, osnoExpenses)
      // Взносы: фикс + 1% с базы (доходы − профвычет), как для объекта «Д − Р».
      osnoContr = calcContributions(
        o.year,
        osnoIncome,
        osnoRes.professional_deduction.toNumber(),
        'income_minus',
        { regDate: o.regDate || undefined }
      )
    } catch {
      osnoRes = null
      osnoContr = null
    }
  }

  // Доход для НДС: из операций (поквартальный режим) или ручной — согласовано с расчётом УСН.
  const vatIncome =
    computed && computed.quarterly
      ? computed.byQuarter.reduce((s, q) => s + q.income, 0)
      : o.income

  let vatRes: ReturnType<typeof calcVatUsn> | null = null
  try {
    vatRes = calcVatUsn(o.year, vatIncome, { mode: o.vatMode })
  } catch {
    vatRes = null
  }

  // Калькулятор выгодной ставки НДС (5/7 без вычета vs общая с вычетом).
  const [inputVat, setInputVat] = useState(0)
  let vatChoice: ReturnType<typeof compareVatOptions> | null = null
  try {
    vatChoice = o.vat && vatIncome > 0 ? compareVatOptions(o.year, vatIncome, inputVat) : null
  } catch {
    vatChoice = null
  }

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

              {isOsno ? (
                <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm text-ink">
                  Система: <span className="font-semibold">ОСНО (общая)</span>
                  <span className="block text-xs text-muted">
                    НДФЛ + НДС. Сменить систему — в «Реквизитах».
                  </span>
                </div>
              ) : (
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
              )}

              <Field label="Годовой доход" hint={formatRub(o.income)}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={o.income}
                  onChange={(e) => updateActiveOrg({ income: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>

              {(!isIncome || isOsno) && (
                <Field
                  label={isOsno ? 'Годовые расходы (подтверждённые)' : 'Годовые расходы'}
                  hint={formatRub(o.expenses)}
                >
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

          {isOsno && osnoRes && (
            <>
              <Card>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted">НДФЛ за год</div>
                    <div className="tnum mt-1 text-4xl font-semibold text-ink">
                      {dec(osnoRes.ndfl)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted">НДС с реализации</div>
                    <div className="tnum mt-1 text-2xl font-semibold text-brand-600">
                      {dec(osnoRes.vat)}
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="НДФЛ — как посчитан">
                <Row label="Доходы за год" value={dec(osnoRes.income)} />
                <Row
                  label={
                    osnoRes.used_20pct
                      ? '− Профессиональный вычет 20% (расходы не подтверждены)'
                      : '− Профессиональный вычет (подтверждённые расходы)'
                  }
                  value={dec(osnoRes.professional_deduction)}
                />
                <Row label="= База НДФЛ" value={dec(osnoRes.ndfl_base)} />
                <Row
                  label="НДФЛ по прогрессивной шкале"
                  hint="13% до 2,4 млн ₽, далее 15/18/20/22%"
                  value={dec(osnoRes.ndfl)}
                  strong
                />
                <p className="mt-3 text-xs text-muted">
                  Профессиональный вычет (ст. 221 НК РФ): берётся бо́льшее из подтверждённых расходов
                  и 20% от доходов. {yearTaxOps.length > 0 && 'Доходы/расходы — из операций «Денег».'}
                </p>
              </Card>

              <Card title="НДС с реализации">
                <Row label="Ставка НДС" value={`${osnoRes.vat_rate.toNumber()}%`} />
                <Row label="Выручка (с НДС)" value={dec(osnoRes.income)} />
                <Row label="НДС в т.ч. (к уплате)" value={dec(osnoRes.vat)} strong />
                <p className="mt-3 text-xs text-muted">
                  Оценка НДС с реализации без вычета входящего НДС (для вычета нужны счёт-фактуры
                  поставщиков — учёт в развитии). Освобождение по ст. 145 НК РФ — при выручке ≤ 2 млн
                  ₽ за 3 месяца.
                </p>
              </Card>

              {osnoContr && (
                <Card title="Страховые взносы «за себя»">
                  <Row
                    label="Фиксированные"
                    hint={`до ${formatDate(osnoContr.fixed_due)}`}
                    value={dec(osnoContr.fixed)}
                  />
                  <Row
                    label="1% с базы свыше 300 000 ₽"
                    hint={`до ${formatDate(osnoContr.one_percent_due)}`}
                    value={dec(osnoContr.one_percent)}
                  />
                  <Row label="Итого взносов" value={dec(osnoContr.total)} strong />
                </Card>
              )}

              <Note tone="warn">
                ОСНО — базовый модуль: считаются НДФЛ, НДС и взносы. Декларация 3-НДФЛ, авансовые
                платежи по НДФЛ (28 апреля/июля/октября), КУДиР по приказу 86н и декларация по НДС
                для ОСНО — в развитии. Для УСН все формы и календарь уже готовы.
              </Note>
            </>
          )}

          {!isOsno && computed && (
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

              {computed.quarterly && (
                <Card title="Авансы по кварталам (из операций)">
                  <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                    {computed.byQuarter.map((q, i) => (
                      <div key={i} className="rounded-lg bg-slate-50 px-2 py-2">
                        <div className="text-xs text-muted">{q.label}</div>
                        <div className="tnum text-sm font-medium text-ink">{formatRub(q.income)}</div>
                      </div>
                    ))}
                  </div>
                  {computed.usn.periods.map((p, i) => (
                    <Row
                      key={i}
                      label={i < 3 ? `Аванс за ${p.label}` : 'Налог за год (доплата)'}
                      value={dec(p.advance_due_this_period)}
                      strong={i === 3}
                    />
                  ))}
                  <p className="mt-2 text-xs text-muted">
                    Нарастающим итогом из доходов в «Деньгах»; взносы к вычету распределены
                    равномерно по кварталам.
                  </p>
                </Card>
              )}

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
                {computed.contr.notes.map((n, i) => (
                  <p key={i} className="mt-2 text-xs text-muted">
                    {n}
                  </p>
                ))}
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

              <Card title="НДС (для УСН с 2025 года)">
                <div className="mb-3 flex flex-wrap gap-2">
                  {(
                    [
                      ['auto', 'Авто'],
                      ['none', 'Без НДС'],
                      ['rate5', '5%'],
                      ['rate7', '7%'],
                      ['rate10', '10%'],
                      ['general', `${params ? params.vat_general_rate.toNumber() : 22}%`],
                    ] as [OrgVatMode, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateActiveOrg({ vatMode: val })}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        o.vatMode === val
                          ? 'border-brand-500 bg-brand-50 text-brand-600'
                          : 'border-line text-muted hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {vatRes && vatRes.mode === 'usn_lost' ? (
                  <Note tone="warn">
                    {vatRes.notes[vatRes.notes.length - 1] ||
                      'Доход превысил 450 млн ₽ — право на УСН утрачено.'}
                  </Note>
                ) : vatRes && vatRes.exempt ? (
                  <Note>
                    Освобождён от НДС: годовой доход {formatRub(vatIncome)} ≤{' '}
                    {params ? formatRub(params.vat_exempt_threshold.toNumber()) : '60 млн'} (ст. 145 НК РФ).
                  </Note>
                ) : vatRes ? (
                  <>
                    <Row label="Ставка НДС" value={`${vatRes.rate.toNumber()}%`} />
                    <Row label="Налоговая база (без НДС)" value={dec(vatRes.base)} />
                    <Row label="НДС к уплате" value={dec(vatRes.vat)} strong />
                    {vatRes.notes.map((n, i) => (
                      <p key={i} className="mt-2 text-xs text-muted">
                        {n}
                      </p>
                    ))}
                  </>
                ) : null}
                {/* Какая ставка выгоднее: 5/7 без вычета vs общая с вычетом входного */}
                {vatChoice && (
                  <div className="mt-4 rounded-lg border border-line bg-slate-50/60 p-3 dark:bg-slate-800/40">
                    <div className="mb-2 text-sm font-medium text-ink">
                      Какая ставка выгоднее при доходе {formatRub(vatIncome)}?
                    </div>
                    <label className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      Входной НДС за год (из счетов-фактур поставщиков):
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} max-w-[160px] py-1 text-right text-xs`}
                        value={inputVat}
                        onChange={(e) => setInputVat(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </label>
                    <div className="space-y-1">
                      {vatChoice.options.map((opt) => (
                        <div
                          key={opt.mode}
                          className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${
                            opt.mode === vatChoice!.best.mode
                              ? 'border-ok bg-green-50 font-medium dark:bg-green-950/30'
                              : 'border-line'
                          }`}
                        >
                          <span>
                            {opt.rate}%{' '}
                            <span className="text-xs font-normal text-muted">({opt.note})</span>
                            {opt.mode === vatChoice!.best.mode && (
                              <span className="ml-2 text-xs text-ok">← выгоднее</span>
                            )}
                          </span>
                          <span className="tnum">{formatRub(opt.vatDue)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Подсказка для выбора (ст. 164 НК РФ). Спец-ставка 5/7% фиксируется на 12
                      кварталов подряд — решение сверьте с бухгалтером. Выбранная ставка задаётся в
                      «Реквизитах».
                    </p>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted">
                  ИП на УСН платят НДС при доходе свыше порога освобождения (
                  {params ? formatRub(params.vat_exempt_threshold.toNumber()) : '60 млн'}/год): спец-ставки
                  5% и 7% без вычета входящего, либо общая{' '}
                  {params ? params.vat_general_rate.toNumber() : 22}% с вычетом. С 2026 общая ставка 22%,
                  порог снижен до 20 млн ₽ (ФЗ № 425-ФЗ). Ставка по умолчанию берётся из «Реквизитов».
                </p>
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
