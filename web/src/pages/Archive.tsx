import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useArchive, type ArchiveRecord } from '../state/archiveStore'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { Card, Note } from '../components/ui'
import { PrintModal } from '../components/PrintModal'
import { DeclarationDoc } from '../components/DeclarationDoc'
import { EnsNotificationDoc } from '../components/EnsNotificationDoc'
import { VatDeclarationDoc } from '../components/VatDeclarationDoc'

const KIND_LABEL = {
  payment: 'Платёж',
  report: 'Отчёт',
  notification: 'Уведомление',
  task: 'Задача',
} as const

export function Archive() {
  const { activeOrg } = useOrg()
  const { ops } = useOps()
  const { records, removeArchive } = useArchive()
  const [open, setOpen] = useState<ArchiveRecord | null>(null)

  let computed: ReturnType<typeof compute> | null = null
  try {
    computed = compute(activeOrg, ops)
  } catch {
    computed = null
  }

  const renderDoc = (rec: ArchiveRecord) => {
    if (!computed) return <Note>Не удалось пересобрать документ — проверьте расчёт.</Note>
    if (rec.docKind === 'declaration') return <DeclarationDoc org={activeOrg} computed={computed} />
    if (rec.docKind === 'ens') return <EnsNotificationDoc org={activeOrg} computed={computed} />
    if (rec.docKind === 'vat' && computed.vat) return <VatDeclarationDoc org={activeOrg} vat={computed.vat} />
    return (
      <Note>
        Повторная печать этой формы доступна в соответствующем разделе. Здесь хранится факт сдачи:{' '}
        {rec.title} ({rec.period}), сдано {formatDate(rec.submittedAt)}.
      </Note>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Архив сданного</h1>
        <p className="mt-1 text-sm text-muted">
          Отчёты и платежи, отмеченные «Сдано» на дашборде. Можно открыть и распечатать повторно.
        </p>
      </header>

      <Card title={`Сданные задачи (${records.length})`}>
        {records.length === 0 ? (
          <p className="text-sm text-muted">
            Пока пусто. Отметьте задачу «Сдано» в разделе «Задачи и отчётность» — она появится здесь.
          </p>
        ) : (
          <div className="space-y-1.5">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  {KIND_LABEL[rec.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{rec.title}</div>
                  <div className="text-xs text-muted">
                    срок {formatDate(rec.dueDate)} · сдано {formatDate(rec.submittedAt)}
                  </div>
                </div>
                {rec.amount != null && (
                  <span className="tnum text-sm font-medium text-ink">{formatRub(rec.amount)}</span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(rec)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  Открыть
                </button>
                <button
                  type="button"
                  onClick={() => removeArchive(rec.id)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-ink"
                >
                  Вернуть в задачи
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <PrintModal title={`${open.title} — архив`} onClose={() => setOpen(null)}>
          {renderDoc(open)}
        </PrintModal>
      )}
    </div>
  )
}
