import { useMemo, useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useContractors } from '../state/contractorsStore'
import {
  usePayments,
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
    payeeName: kind === 'transfer' ? activeOrg.fio || activeOrg.name : '',
    payeeInn: kind === 'transfer' ? activeOrg.inn : '',
    payeeKpp: '',
    payeeAccount: '',
    payeeBank: kind === 'transfer' ? activeOrg.bankName : '',
    payeeBik: kind === 'transfer' ? activeOrg.bik : '',
    purpose: kind === 'transfer' ? 'Перевод между своими счетами. НДС не облагается.' : '',
    ...(kind === 'ens' ? ENS_PAYEE : {}),
  })

  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [tab, setTab] = useState<'pending' | 'paid'>('pending')
  const [printPayment, setPrintPayment] = useState<Payment | null>(null)

  const setKind = (kind: PaymentKind) => setDraft({ ...emptyDraft(kind), number: draft.number, amount: draft.amount, date: draft.date })

  const pickContractor = (id: string) => {
    const c = contractors.find((x) => x.id === id)
    if (!c) return
    setDraft((d) => ({ ...d, payeeName: c.name, payeeInn: c.inn, payeeKpp: c.kpp }))
  }

  const create = () => {
    if (draft.amount <= 0 || !draft.payeeName.trim()) return
    addPayment({ ...draft, status: 'pending', paidDate: '' })
    // Следующий номер считаем от текущего (+1), а не от устаревшего useMemo nextNumber,
    // иначе две платёжки подряд получат одинаковый № (в форме 0401060 № должен быть уникален).
    setDraft({ ...emptyDraft(draft.kind), number: String((Number(draft.number) || 0) + 1) })
  }

  const markPaid = (p: Payment) => {
    const paidDate = today()
    let linkedOpId: string | undefined
    // Оплаченная платёжка → расход в «Деньгах» (кроме перевода между своими счетами).
    if (p.kind !== 'transfer') {
      linkedOpId = addOp({
        date: paidDate,
        kind: 'expense',
        amount: p.amount,
        counterparty: p.payeeName,
        doc: `Платёжка № ${p.number}`,
        note: p.purpose || PAYMENT_KIND_LABEL[p.kind],
        taxable: p.kind === 'contractor', // налоги/взносы (ЕНС) не уменьшают базу УСН
      })
    }
    updatePayment(p.id, { status: 'paid', paidDate, linkedOpId })
  }

  const list = payments.filter((p) => p.status === tab)
  const pendingCount = payments.filter((p) => p.status === 'pending').length
  const paidCount = payments.length - pendingCount

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Платёжки</h1>
        <p className="mt-1 text-sm text-muted">
          Платёжные поручения (форма 0401060): оплата контрагенту, пополнение ЕНС, перевод между
          счетами. Оплаченные попадают в «Деньги» как расход.
        </p>
      </header>

      {/* Создать платёжку */}
      <Card title="Новая платёжка" className="mb-5">
        <Field label="Тип платежа">
          <div className="grid gap-2 sm:grid-cols-3">
            {(['contractor', 'ens', 'transfer'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  draft.kind === k
                    ? 'border-brand-500 bg-brand-50 text-brand-600'
                    : 'border-line text-muted hover:border-slate-300'
                }`}
              >
                {PAYMENT_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>

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
          {draft.kind === 'contractor' && contractors.length > 0 && (
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
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={draft.kind === 'transfer' ? 'Счёт-получатель (своё)' : 'Получатель'}>
            <input
              className={inputClass}
              placeholder={draft.kind === 'ens' ? 'Казначейство России (ФНС России)' : 'ООО «Ромашка»'}
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

        <div className="mt-4">
          <button
            type="button"
            onClick={create}
            disabled={draft.amount <= 0 || !draft.payeeName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlus size={16} />
            Создать платёжку
          </button>
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
                      {p.status === 'paid' && (
                        <div className="text-xs text-ok">Оплачено {formatDate(p.paidDate)}</div>
                      )}
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
          расход в «Деньги». Реальная отправка в банк — на серверном этапе; сейчас формируется
          печатное поручение для интернет-банка.
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
