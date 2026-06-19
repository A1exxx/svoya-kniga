import { useMemo, useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useContractors } from '../state/contractorsStore'
import {
  usePayments,
  PAYMENT_KINDS,
  PAYMENT_KIND_LABEL,
  type Payment,
  type PaymentKind,
} from '../state/paymentsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { PaymentOrderDoc } from '../components/PaymentOrderDoc'

const today = () => new Date().toISOString().slice(0, 10)

type Draft = Omit<Payment, 'id' | 'status' | 'paidDate' | 'linkedOpId'>

/** Бюджетные платежи (реквизиты получателя — казначейство/СФР). */
const isBudgetKind = (k: PaymentKind) => k === 'ens' || k === 'injury'

/** Ставки НДС в платеже. */
const VAT_OPTIONS: [string, string][] = [
  ['none', 'Без НДС'],
  ['5', 'НДС 5%'],
  ['7', 'НДС 7%'],
  ['10', 'НДС 10%'],
  ['20', 'НДС 20%'],
  ['22', 'НДС 22%'],
]

/** Реквизиты получателя единого налогового платежа (ЕНП) — едины для всей РФ с 2023 г. */
const ENS_PAYEE = {
  payeeName: 'Казначейство России (ФНС России)',
  payeeInn: '7727406020',
  payeeKpp: '770801001',
  payeeAccount: '03100643000000018500',
  payeeBank: 'ОТДЕЛЕНИЕ ТУЛА БАНКА РОССИИ//УФК по Тульской области, г. Тула',
  payeeBik: '017003983',
  purpose: 'Единый налоговый платёж',
}

const defaultPurpose = (kind: PaymentKind): string => {
  switch (kind) {
    case 'transfer':
      return 'Перевод между своими счетами. НДС не облагается.'
    case 'personal':
      return 'Перечисление собственных средств ИП на личные нужды. НДС не облагается.'
    case 'salary':
      return 'Выплата заработной платы'
    case 'injury':
      return 'Страховые взносы на обязательное соц. страхование от несчастных случаев'
    case 'ens':
      return 'Единый налоговый платёж'
    default:
      return ''
  }
}

export function Payments() {
  const { activeOrg } = useOrg()
  const { addOp, removeOp } = useOps()
  const { contractors } = useContractors()
  const { payments, addPayment, updatePayment, removePayment } = usePayments()

  const nextNumber = useMemo(() => {
    const max = payments.reduce((m, p) => Math.max(m, Number(p.number) || 0), 0)
    return String(max + 1)
  }, [payments])

  const emptyDraft = (kind: PaymentKind = 'contractor'): Draft => ({
    number: nextNumber,
    date: today(),
    kind,
    amount: 0,
    payeeName: kind === 'transfer' || kind === 'personal' ? activeOrg.fio || activeOrg.name : '',
    payeeInn: kind === 'transfer' || kind === 'personal' ? activeOrg.inn : '',
    payeeKpp: '',
    payeeAccount: '',
    payeeBank: kind === 'transfer' || kind === 'personal' ? activeOrg.bankName : '',
    payeeBik: kind === 'transfer' || kind === 'personal' ? activeOrg.bik : '',
    purpose: defaultPurpose(kind),
    vat: 'none',
    taxable: PAYMENT_KINDS[kind].taxableDefault,
    planDate: '',
    ...(kind === 'ens' ? ENS_PAYEE : {}),
  })

  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [tab, setTab] = useState<'pending' | 'paid'>('pending')
  const [printPayment, setPrintPayment] = useState<Payment | null>(null)

  const meta = PAYMENT_KINDS[draft.kind]
  // Получатель-контрагент обязателен только для типов, где он по смыслу нужен.
  const payeeRequired = meta.needsPayee
  const canCreate = draft.amount > 0 && (!payeeRequired || draft.payeeName.trim().length > 0)
  const why = draft.amount <= 0 ? 'укажите сумму' : !canCreate ? 'укажите получателя' : ''

  const setKind = (kind: PaymentKind) =>
    setDraft({
      ...emptyDraft(kind),
      number: draft.number,
      amount: draft.amount,
      date: draft.date,
      planDate: draft.planDate,
    })

  const pickContractor = (id: string) => {
    const c = contractors.find((x) => x.id === id)
    if (!c) return
    setDraft((d) => ({ ...d, payeeName: c.name, payeeInn: c.inn, payeeKpp: c.kpp }))
  }

  const create = () => {
    if (!canCreate) return
    addPayment({ ...draft, status: 'pending', paidDate: '' })
    // Следующий № считаем от текущего (+1), а не от устаревшего useMemo nextNumber,
    // иначе две платёжки подряд получат одинаковый № (в форме 0401060 № должен быть уникален).
    setDraft({ ...emptyDraft(draft.kind), number: String((Number(draft.number) || 0) + 1) })
  }

  const markPaid = (p: Payment) => {
    const paidDate = today()
    let linkedOpId: string | undefined
    // Оплаченная платёжка → расход в «Деньгах» (кроме перевода между своими счетами —
    // это движение внутри ИП, не доход и не расход).
    if (p.kind !== 'transfer') {
      linkedOpId = addOp({
        date: paidDate,
        kind: 'expense',
        amount: p.amount,
        counterparty: p.payeeName,
        doc: `Платёжка № ${p.number}`,
        note: p.purpose || PAYMENT_KIND_LABEL[p.kind],
        taxable: p.taxable ?? PAYMENT_KINDS[p.kind].taxableDefault,
        vat: p.vat && p.vat !== 'none' ? p.vat : undefined,
      })
    }
    updatePayment(p.id, { status: 'paid', paidDate, linkedOpId })
  }

  const list = payments.filter((p) => p.status === tab)
  const pendingCount = payments.filter((p) => p.status === 'pending').length
  const paidCount = payments.length - pendingCount

  // Группы для выпадающего списка типов операции.
  const groups: Record<string, PaymentKind[]> = {}
  for (const k of Object.keys(PAYMENT_KINDS) as PaymentKind[]) {
    const g = PAYMENT_KINDS[k].group
    ;(groups[g] ??= []).push(k)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Платёжки</h1>
        <p className="mt-1 text-sm text-muted">
          Платёжные поручения (форма 0401060). Выберите тип операции, заполните сумму и реквизиты —
          оплаченная платёжка попадёт в «Деньги».
        </p>
      </header>

      {/* Создать платёжку */}
      <Card title="Новая платёжка" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Тип операции">
            <select
              className={inputClass}
              value={draft.kind}
              onChange={(e) => setKind(e.target.value as PaymentKind)}
            >
              {Object.entries(groups).map(([g, kinds]) => (
                <optgroup key={g} label={g}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {PAYMENT_KINDS[k].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          {draft.kind === 'contractor' || draft.kind === 'supplier_advance' || draft.kind === 'customer_refund' ? (
            contractors.length > 0 ? (
              <Field label="Из контрагентов">
                <select className={inputClass} defaultValue="" onChange={(e) => pickContractor(e.target.value)}>
                  <option value="">— выбрать —</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'без названия'}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Из контрагентов" hint="справочник пуст — заполните получателя вручную">
                <input className={inputClass} disabled placeholder="нет сохранённых контрагентов" />
              </Field>
            )
          ) : (
            <div />
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="№ платёжки">
            <input
              className={inputClass}
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
            />
          </Field>
          <Field label="Дата">
            <input
              type="date"
              className={inputClass}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>
          <Field label="Сумма" hint={formatRub(draft.amount)}>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Когда заплатить" hint="план; необязательно">
            <input
              type="date"
              className={inputClass}
              value={draft.planDate || ''}
              onChange={(e) => setDraft({ ...draft, planDate: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label={
              draft.kind === 'transfer'
                ? 'Счёт-получатель (своё)'
                : draft.kind === 'personal'
                  ? 'Получатель (личный счёт ИП)'
                  : payeeRequired
                    ? 'Получатель *'
                    : 'Получатель'
            }
          >
            <input
              className={inputClass}
              placeholder={
                draft.kind === 'ens'
                  ? 'Казначейство России (ФНС России)'
                  : draft.kind === 'salary'
                    ? 'сотрудник / ведомость'
                    : 'ООО «Ромашка»'
              }
              value={draft.payeeName}
              onChange={(e) => setDraft({ ...draft, payeeName: e.target.value })}
            />
          </Field>
          <Field label="Назначение платежа">
            <input
              className={inputClass}
              placeholder="Оплата по счёту № 12 от 01.06.2026"
              value={draft.purpose}
              onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
            />
          </Field>

          {/* Реквизиты получателя — для контрагентов и бюджетных платежей */}
          {(payeeRequired || isBudgetKind(draft.kind) || draft.kind === 'transfer') && (
            <>
              <Field label="ИНН получателя">
                <input
                  className={inputClass}
                  value={draft.payeeInn}
                  onChange={(e) => setDraft({ ...draft, payeeInn: e.target.value })}
                />
              </Field>
              <Field label="КПП получателя">
                <input
                  className={inputClass}
                  value={draft.payeeKpp}
                  onChange={(e) => setDraft({ ...draft, payeeKpp: e.target.value })}
                />
              </Field>
              <Field label="Расчётный счёт получателя">
                <input
                  className={inputClass}
                  value={draft.payeeAccount}
                  onChange={(e) => setDraft({ ...draft, payeeAccount: e.target.value })}
                />
              </Field>
              <Field label="Банк получателя">
                <input
                  className={inputClass}
                  value={draft.payeeBank}
                  onChange={(e) => setDraft({ ...draft, payeeBank: e.target.value })}
                />
              </Field>
              <Field label="БИК банка получателя">
                <input
                  className={inputClass}
                  value={draft.payeeBik}
                  onChange={(e) => setDraft({ ...draft, payeeBik: e.target.value })}
                />
              </Field>
            </>
          )}

          {/* НДС в платеже + учёт в УСН */}
          <Field label="НДС" hint="выделяется в назначении и книге покупок">
            <select
              className={inputClass}
              value={draft.vat || 'none'}
              onChange={(e) => setDraft({ ...draft, vat: e.target.value })}
            >
              {VAT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                checked={draft.taxable ?? false}
                onChange={(e) => setDraft({ ...draft, taxable: e.target.checked })}
              />
              <span className="text-sm text-ink">
                Учитывать в расходах УСН <span className="text-muted">(Доходы−Расходы)</span>
              </span>
            </label>
          </div>
        </div>

        {draft.kind === 'ens' && (
          <div className="mt-3">
            <Note>
              Реквизиты получателя ЕНП едины для всей РФ (Казначейство России, г. Тула, БИК
              017003983). В платёжке указываются КБК ЕНП 18201061201010000510 и статус 01 — деньги
              поступают на ваш единый налоговый счёт и распределяются по уведомлениям/декларациям.
            </Note>
          </div>
        )}
        {draft.kind === 'injury' && (
          <div className="mt-3">
            <Note tone="warn">
              Взносы на травматизм платятся отдельно в СФР (не через ЕНС), со своим КБК и ОКТМО, до
              15-го числа следующего месяца. Реквизиты СФР — из вашего региона.
            </Note>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlus size={16} />
            Создать платёжку
          </button>
          {!canCreate && <span className="text-xs text-warn">Чтобы создать — {why}.</span>}
        </div>
      </Card>

      {/* Список платёжек */}
      <Card
        title="Платёжки"
        right={
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['pending', `Текущие (${pendingCount})`],
                ['paid', `Оплаченные (${paidCount})`],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {list.length === 0 ? (
          <p className="text-sm text-muted">
            {tab === 'pending' ? 'Нет текущих платёжек.' : 'Нет оплаченных платёжек.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">№</th>
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 font-medium">Тип</th>
                  <th className="py-2 pr-3 font-medium">Получатель / назначение</th>
                  <th className="py-2 pr-3 text-right font-medium">Сумма</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 align-top">
                    <td className="tnum py-2 pr-3 text-ink">{p.number}</td>
                    <td className="tnum py-2 pr-3 text-muted">{formatDate(p.date)}</td>
                    <td className="py-2 pr-3 text-ink">{PAYMENT_KIND_LABEL[p.kind]}</td>
                    <td className="py-2 pr-3 text-ink">
                      {p.payeeName || '—'}
                      {p.purpose && <div className="text-xs text-slate-400">{p.purpose}</div>}
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[11px]">
                        {p.vat && p.vat !== 'none' && <span className="text-muted">НДС {p.vat}%</span>}
                        {p.taxable && <span className="text-muted">в расходах УСН</span>}
                        {p.status === 'pending' && p.planDate && (
                          <span className="text-warn">заплатить до {formatDate(p.planDate)}</span>
                        )}
                        {p.status === 'paid' && (
                          <span className="text-ok">Оплачено {formatDate(p.paidDate)}</span>
                        )}
                      </div>
                    </td>
                    <td className="tnum py-2 pr-3 text-right font-medium text-ink">
                      {formatRub(p.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPrintPayment(p)}
                          className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-brand-600"
                        >
                          печать
                        </button>
                        {p.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => markPaid(p)}
                            className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-ok"
                          >
                            оплатить
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Удалить платёжку № ${p.number}?` +
                                  (p.linkedOpId ? ' Связанный расход в «Деньгах» тоже будет удалён.' : '')
                              )
                            )
                              return
                            // Удаляем и связанный расход в «Деньгах» (иначе осиротевший
                            // расход продолжит уменьшать базу УСН без первичной платёжки).
                            if (p.linkedOpId) removeOp(p.linkedOpId)
                            removePayment(p.id)
                          }}
                          className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                        >
                          удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5">
        <Note>
          «Оплатить» помечает платёжку оплаченной и (кроме перевода между своими счетами) заносит
          расход в «Деньги» с выбранным НДС и признаком «учитывать в УСН». Реальная отправка в банк —
          на серверном этапе; сейчас формируется печатное поручение для интернет-банка.
        </Note>
      </div>

      {printPayment && (
        <PrintModal title="Платёжное поручение — предпросмотр" onClose={() => setPrintPayment(null)}>
          <PaymentOrderDoc org={activeOrg} payment={printPayment} />
        </PrintModal>
      )}
    </div>
  )
}
