import { useState, type ReactNode } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useDocs } from '../state/docsStore'
import { useEmployees } from '../state/employeesStore'
import { compute } from '../lib/compute'
import { buildVatBooks } from '../lib/vatBooks'
import { Card, Note } from '../components/ui'
import { PrintModal } from '../components/PrintModal'
import { SendDemoModal } from '../components/SendDemoModal'
import { DeclarationDoc } from '../components/DeclarationDoc'
import { EnsNotificationDoc } from '../components/EnsNotificationDoc'
import { VatDeclarationDoc } from '../components/VatDeclarationDoc'
import { KudirDoc } from '../components/KudirDoc'
import { PayrollReportDoc, REPORT_TITLE, type ReportType } from '../components/PayrollReportDoc'
import { declarationUsnXml, declarationFileName } from '../lib/declarationXml'
import { ensNotificationXml, ensFileName } from '../lib/ensXml'
import { vatDeclarationXml, vatDeclarationFileName } from '../lib/vatDeclarationXml'
import { downloadText } from '../lib/download'

interface Report {
  id: string
  name: string
  knd?: string
  period: string
  authority: string
  node: ReactNode
  xml?: () => void
  sendable: boolean
}

const btnGhost =
  'cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50'
const btnPrimary =
  'cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700'

const PAYROLL_META: Record<ReportType, { knd?: string; period: string; authority: string }> = {
  '6ndfl': { knd: '1151100', period: 'квартал / год', authority: 'ФНС' },
  rsv: { knd: '1151111', period: 'квартал', authority: 'ФНС' },
  efs1: { knd: '1151162', period: 'по событию / год', authority: 'СФР' },
  perssved: { knd: '1151162', period: 'месяц', authority: 'ФНС' },
}

export function Reports() {
  const { activeOrg: o } = useOrg()
  const { ops } = useOps()
  const { docs } = useDocs()
  const { employees } = useEmployees()
  const [viewId, setViewId] = useState<string | null>(null)
  const [sendName, setSendName] = useState<string | null>(null)

  let computed: ReturnType<typeof compute> | null = null
  try {
    computed = compute(o, ops)
  } catch {
    computed = null
  }

  const taxReports: Report[] = computed
    ? [
        {
          id: 'usn-decl',
          name: 'Декларация по УСН',
          knd: '1152017',
          period: `${o.year} год`,
          authority: 'ФНС',
          node: <DeclarationDoc org={o} computed={computed} />,
          xml: () =>
            downloadText(declarationFileName(o), declarationUsnXml(o, computed!), 'application/xml;charset=utf-8'),
          sendable: true,
        },
        {
          id: 'ens',
          name: 'Уведомление об исчисленных суммах',
          knd: '1110355',
          period: 'квартал',
          authority: 'ФНС',
          node: <EnsNotificationDoc org={o} computed={computed} />,
          xml: () =>
            downloadText(ensFileName(o), ensNotificationXml(o, computed!), 'application/xml;charset=utf-8'),
          sendable: true,
        },
        ...(o.vat && computed.vat
          ? [
              {
                id: 'vat-decl',
                name: 'Декларация по НДС',
                knd: '1151001',
                period: 'квартал',
                authority: 'ФНС',
                node: (
                  <VatDeclarationDoc
                    org={o}
                    vat={computed.vat}
                    books={buildVatBooks(docs, o.year)}
                  />
                ),
                xml: () =>
                  downloadText(
                    vatDeclarationFileName(o),
                    vatDeclarationXml(o, computed!.vat!, '24', buildVatBooks(docs, o.year)),
                    'application/xml;charset=windows-1251'
                  ),
                sendable: true,
              },
            ]
          : []),
        {
          id: 'kudir',
          name: 'Книга учёта доходов и расходов (КУДиР)',
          period: `${o.year} год`,
          authority: 'хранится у ИП',
          node: <KudirDoc org={o} ops={ops} />,
          sendable: false,
        },
      ]
    : []

  const payrollReports: Report[] =
    employees.length > 0
      ? (Object.keys(PAYROLL_META) as ReportType[]).map((t) => ({
          id: `pr-${t}`,
          name: REPORT_TITLE[t],
          knd: PAYROLL_META[t].knd,
          period: PAYROLL_META[t].period,
          authority: PAYROLL_META[t].authority,
          node: <PayrollReportDoc org={o} employees={employees} type={t} />,
          sendable: true,
        }))
      : []

  const all = [...taxReports, ...payrollReports]
  const selected = all.find((r) => r.id === viewId) ?? null

  const section = (title: string, items: Report[], empty: string) => (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{r.name}</div>
                <div className="text-xs text-muted">
                  {r.knd ? `КНД ${r.knd} · ` : ''}
                  {r.period} · {r.authority}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button type="button" onClick={() => setViewId(r.id)} className={btnGhost}>
                  Открыть
                </button>
                {r.xml && (
                  <button type="button" onClick={r.xml} className={btnGhost}>
                    XML
                  </button>
                )}
                {r.sendable && (
                  <button type="button" onClick={() => setSendName(r.name)} className={btnPrimary}>
                    Отправить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{o.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Отчётность</h1>
        <p className="mt-1 text-sm text-muted">
          Все формы в одном месте — посмотреть, скачать XML, отправить. Всего форм: {all.length}.
        </p>
      </header>

      <div className="space-y-5">
        {section('Налоговая отчётность (ФНС)', taxReports, 'Заполните данные на экране «Налоги».')}
        {section(
          'Отчётность за сотрудников (ФНС / СФР)',
          payrollReports,
          'Нет сотрудников. Добавьте их в разделе «Сотрудники» → «Штат» — отчёты появятся здесь.'
        )}
      </div>

      <div className="mt-5">
        <Note>
          Формы заполняются автоматически из ваших данных. XML декларации и уведомления — в формате
          ФНС (демо, перед сдачей сверить с XSD). Подпись КЭП и отправка в ФНС/СФР — пока имитация
          процесса с квитанцией.
        </Note>
      </div>

      {selected && (
        <PrintModal title={`${selected.name} — предпросмотр`} onClose={() => setViewId(null)}>
          {selected.node}
        </PrintModal>
      )}
      {sendName && <SendDemoModal docTitle={sendName} onClose={() => setSendName(null)} />}
    </div>
  )
}
