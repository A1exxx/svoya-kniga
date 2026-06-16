import type { ReactNode } from 'react'

/** Оверлей с печатным документом. Кнопка «Печать / PDF» вызывает печать браузера;
 *  @media print в index.css показывает только .print-doc. */
export function PrintModal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <div className="no-print flex items-center justify-between border-b border-line bg-white px-5 py-3">
        <span className="font-medium text-ink">{title}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Печать / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-auto p-6">
        <div className="print-doc w-[210mm] max-w-full bg-white p-[16mm] text-[13px] leading-relaxed text-ink shadow-card">
          {children}
        </div>
      </div>
    </div>
  )
}
