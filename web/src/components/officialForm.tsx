import type { ReactNode } from 'react'
import { formatDate } from '../lib/format'
import { code39Svg } from '../lib/barcode'

/**
 * Примитивы для печатных форм ФНС «как официальный бланк»: клеточные поля (по одному
 * символу в клетке), шапка «Форма по КНД …», титульные поля, подписной блок.
 * Машиночитаемый двумерный штрих-код формируется официальной программой «Налогоплательщик
 * ЮЛ» / ЛК ФНС из XML-выгрузки — здесь его место обозначено.
 */

/** Клеточные поля: по одному символу в клетке (как в бланках ФНС). */
export function Cells({
  value,
  count,
  className = '',
}: {
  value?: string | number | null
  count: number
  className?: string
}) {
  const s = value == null ? '' : String(value)
  const chars = s.slice(0, count).split('')
  return (
    <span className={`inline-flex flex-wrap gap-[2px] align-middle ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="tnum inline-flex h-5 w-[13px] items-center justify-center border border-slate-400 text-[11px] leading-none"
        >
          {chars[i] ?? ''}
        </span>
      ))}
    </span>
  )
}

/** Шапка бланка: место под двумерный штрих-код + ИНН/КПП клетками + «Стр. NNN», название и КНД. */
export function FormKndHeader({
  knd,
  title,
  subtitle,
  page = '001',
  inn,
  kpp,
}: {
  knd?: string
  title: string
  subtitle?: string
  page?: string
  inn?: string
  kpp?: string
}) {
  return (
    <div className="mb-3">
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center border border-dashed border-slate-300 text-center text-[7px] leading-tight text-slate-400">
          штрих-
          <br />
          код
        </div>
        <div className="text-right text-[11px] text-slate-500">
          <div className="flex items-center justify-end gap-1">
            ИНН <Cells value={inn} count={12} />
          </div>
          <div className="mt-1 flex items-center justify-end gap-1">
            КПП <Cells value={kpp} count={9} />
          </div>
          <div className="mt-1">
            Стр. <span className="font-mono">{page}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        {knd && <div className="text-[11px] text-slate-500">Форма по КНД {knd}</div>}
        <div className="text-sm font-semibold leading-snug">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
      </div>
    </div>
  )
}

/** Строка титульного листа: подпись поля слева + значение справа. */
export function FormField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

/** Подписной блок «Достоверность и полноту сведений подтверждаю». */
export function SignBlock({ name, role = 1 }: { name: string; role?: 1 | 2 }) {
  return (
    <div className="mt-6 text-[12px]">
      <div className="text-[11px] text-slate-500">
        Достоверность и полноту сведений подтверждаю (1 — налогоплательщик, 2 — представитель):
        <span className="ml-2 inline-flex h-5 w-[13px] items-center justify-center border border-slate-400 font-mono">
          {role}
        </span>
      </div>
      <div className="mt-2">{name || '____________________'}</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-6">
        <span>Подпись ______________</span>
        <span className="flex items-baseline gap-1">
          Дата <Cells count={8} />
        </span>
      </div>
    </div>
  )
}

/** Нижняя сноска «официальный бланк / XML в Налогоплательщик ЮЛ». */
export function OfficialNote({ extra }: { extra?: ReactNode }) {
  return (
    <div className="mt-6 text-[11px] text-slate-400">
      Официальный бланк (макет). Для подачи скачайте XML и загрузите в бесплатную программу ФНС
      «Налогоплательщик ЮЛ» или в ЛК ФНС — она напечатает машиночитаемую форму с двумерным
      штрих-кодом. Сформировано в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}.
      {extra ? <> {extra}</> : null}
    </div>
  )
}

/** Штрих-код страницы (Code 39) + номер под ним — как в верхнем левом углу бланков ФНС. */
export function PageBarcode({ code }: { code: string }) {
  return (
    <div className="leading-none">
      <div
        className="[&>svg]:block [&>svg]:h-[26px]"
        dangerouslySetInnerHTML={{ __html: code39Svg(code, { height: 26, narrow: 1 }) }}
      />
      <div className="mt-0.5 text-center font-mono text-[10px] tracking-[0.2em]">{code}</div>
    </div>
  )
}

/** Верх официального листа: штрих-код страницы слева + ИНН/КПП/Стр. клетками справа. */
export function OfficialTop({
  code,
  inn,
  kpp,
  page = '001',
}: {
  code: string
  inn?: string
  kpp?: string
  page?: string
}) {
  return (
    <div className="mb-2 flex items-start justify-between">
      <PageBarcode code={code} />
      <div className="text-[11px] text-slate-600">
        <div className="flex items-center justify-end gap-1">
          ИНН <Cells value={inn} count={12} />
        </div>
        <div className="mt-1 flex items-center justify-end gap-1">
          КПП <Cells value={kpp} count={9} />
        </div>
        <div className="mt-1 flex items-center justify-end gap-1">
          Стр. <Cells value={page} count={3} />
        </div>
      </div>
    </div>
  )
}
