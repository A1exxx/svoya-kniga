import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useTaxOffice } from '../state/taxOfficeStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { SendDemoModal } from '../components/SendDemoModal'
import { activeGateway, RECONCILIATION_LABEL, type ReconciliationKind } from '../lib/fns/gateway'

const today = () => new Date().toISOString().slice(0, 10)
const gw = activeGateway()

export function TaxOffice() {
  const { activeOrg } = useOrg()
  const {
    data,
    addBalance,
    removeBalance,
    addRecon,
    setReconStatus,
    removeRecon,
    addLetter,
    updateLetter,
    removeLetter,
  } = useTaxOffice()

  const [bal, setBal] = useState({ date: today(), saldo: 0, note: '' })
  const [reconMsg, setReconMsg] = useState<string | null>(null)
  const [authority, setAuthority] = useState<'fns' | 'sfr'>('fns')
  const [letter, setLetter] = useState({ type: 'Требование', date: today(), subject: '', deadline: '', body: '' })
  const [send, setSend] = useState<string | null>(null)

  const latest = data.balances[0] ?? null
  const letters = data.letters.filter((l) => l.authority === authority)

  const requestRecon = async (kind: ReconciliationKind) => {
    const res = await gw.requestReconciliation(kind)
    addRecon(kind, res.message)
    setReconMsg(res.message)
  }

  const saveLetter = () => {
    if (!letter.subject.trim()) return
    addLetter({ authority, status: 'new', ...letter })
    setLetter({ type: 'Требование', date: today(), subject: '', deadline: '', body: '' })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Налоговая</h1>
        <p className="mt-1 text-sm text-muted">
          Единый налоговый счёт (ЕНС), сверка с налоговой и письма от ФНС/СФР.
        </p>
      </header>

      <Note tone="warn">
        Автоматическая подтяжка из ФНС (сальдо, сверка, требования) требует КЭП и оператора ЭДО —
        это налоговая тайна (ст. 102 НК РФ), «по ИНН» её не получить. Сейчас раздел работает на ручном
        вводе + имитации отправки; реальная интеграция — на серверном этапе (см. план).
      </Note>

      {/* ЕНС */}
      <div className="mt-5">
        <Card
          title="Единый налоговый счёт (ЕНС)"
          right={
            <a
              href="https://lkip2.nalog.ru/"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Открыть ЛК ФНС →
            </a>
          }
        >
          {latest ? (
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <span className="text-sm text-muted">Сальдо на {formatDate(latest.date)}:</span>
              <span
                className={`tnum text-2xl font-semibold ${
                  latest.saldo > 0 ? 'text-ok' : latest.saldo < 0 ? 'text-danger' : 'text-ink'
                }`}
              >
                {formatRub(latest.saldo)}
              </span>
              <span className="text-sm text-muted">
                {latest.saldo > 0 ? '(переплата)' : latest.saldo < 0 ? '(задолженность)' : '(ноль)'}
              </span>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted">Сальдо ещё не внесено. Скопируйте его из ЛК ФНС.</p>
          )}

          <div className="grid items-end gap-3 sm:grid-cols-[140px_180px_1fr_auto]">
            <Field label="Дата">
              <input type="date" className={inputClass} value={bal.date} onChange={(e) => setBal({ ...bal, date: e.target.value })} />
            </Field>
            <Field label="Сальдо, ₽" hint="минус = долг">
              <input
                type="number"
                className={inputClass}
                value={bal.saldo}
                onChange={(e) => setBal({ ...bal, saldo: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Примечание">
              <input className={inputClass} placeholder="из ЛК ФНС" value={bal.note} onChange={(e) => setBal({ ...bal, note: e.target.value })} />
            </Field>
            <button
              type="button"
              onClick={() => addBalance(bal)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Внести
            </button>
          </div>

          {data.balances.length > 0 && (
            <div className="mt-4 space-y-1">
              {data.balances.map((b) => (
                <div key={b.id} className="flex items-center gap-3 border-b border-line/60 py-1.5 text-sm">
                  <span className="tnum w-24 shrink-0 text-muted">{formatDate(b.date)}</span>
                  <span className={`tnum w-28 shrink-0 font-medium ${b.saldo < 0 ? 'text-danger' : 'text-ink'}`}>{formatRub(b.saldo)}</span>
                  <span className="flex-1 truncate text-muted">{b.note}</span>
                  <button type="button" onClick={() => removeBalance(b.id)} className="text-xs text-slate-400 hover:text-danger">удалить</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Сверка */}
      <div className="mt-5">
        <Card title="Сверка с налоговой">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RECONCILIATION_LABEL) as ReconciliationKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => requestRecon(k)}
                className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                Заказать: {RECONCILIATION_LABEL[k]}
              </button>
            ))}
          </div>
          {reconMsg && <p className="mt-2 text-xs text-ok">{reconMsg}</p>}
          {data.recons.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {data.recons.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{RECONCILIATION_LABEL[r.kind]}</div>
                    <div className="text-xs text-muted">запрошено {formatDate(r.requestedAt)}</div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${r.status === 'received' ? 'bg-green-50 text-ok' : 'bg-amber-50 text-warn'}`}>
                    {r.status === 'received' ? 'Получено' : 'Ожидает ответа ФНС (имитация)'}
                  </span>
                  {r.status !== 'received' && (
                    <button type="button" onClick={() => setReconStatus(r.id, 'received')} className="shrink-0 text-xs text-brand-600 hover:underline">отметить полученным</button>
                  )}
                  <button type="button" onClick={() => removeRecon(r.id)} className="shrink-0 text-xs text-slate-400 hover:text-danger">✕</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Письма ФНС/СФР */}
      <div className="mt-5">
        <Card title="Письма и требования">
          <div className="mb-3 inline-flex rounded-lg border border-line p-0.5">
            {(
              [
                ['fns', 'ФНС'],
                ['sfr', 'СФР'],
              ] as ['fns' | 'sfr', string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setAuthority(val)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  authority === val ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid items-end gap-3 sm:grid-cols-[130px_140px_1fr_140px_auto]">
            <Field label="Тип">
              <select className={inputClass} value={letter.type} onChange={(e) => setLetter({ ...letter, type: e.target.value })}>
                <option>Требование</option>
                <option>Уведомление</option>
                <option>Письмо</option>
              </select>
            </Field>
            <Field label="Дата">
              <input type="date" className={inputClass} value={letter.date} onChange={(e) => setLetter({ ...letter, date: e.target.value })} />
            </Field>
            <Field label="Тема">
              <input className={inputClass} placeholder="о чём письмо" value={letter.subject} onChange={(e) => setLetter({ ...letter, subject: e.target.value })} />
            </Field>
            <Field label="Срок ответа">
              <input type="date" className={inputClass} value={letter.deadline} onChange={(e) => setLetter({ ...letter, deadline: e.target.value })} />
            </Field>
            <button type="button" onClick={saveLetter} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">Добавить</button>
          </div>

          <div className="mt-4 space-y-1.5">
            {letters.length === 0 ? (
              <p className="text-sm text-muted">Входящих от {authority === 'fns' ? 'ФНС' : 'СФР'} нет. Заносите вручную из ЛК.</p>
            ) : (
              letters.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted">{l.type}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{l.subject}</div>
                    <div className="text-xs text-muted">
                      {formatDate(l.date)}
                      {l.deadline && ` · ответить до ${formatDate(l.deadline)}`}
                    </div>
                  </div>
                  <select
                    className="rounded-lg border border-line px-2 py-1 text-xs"
                    value={l.status}
                    onChange={(e) => updateLetter(l.id, { status: e.target.value as 'new' | 'in_progress' | 'answered' })}
                  >
                    <option value="new">Новое</option>
                    <option value="in_progress">В работе</option>
                    <option value="answered">Отвечено</option>
                  </select>
                  <button type="button" onClick={() => setSend(`Ответ на «${l.subject}»`)} className="text-xs text-brand-600 hover:underline">Ответить</button>
                  <button type="button" onClick={() => removeLetter(l.id)} className="text-xs text-slate-400 hover:text-danger">✕</button>
                </div>
              ))
            )}
          </div>
          <p className="mt-3 text-xs text-muted">
            Реально требования ФНС приходят по ТКС через оператора ЭДО. Здесь — ручной учёт; «Ответить» — имитация.
          </p>
        </Card>
      </div>

      {send && <SendDemoModal docTitle={send} onClose={() => setSend(null)} />}
    </div>
  )
}
