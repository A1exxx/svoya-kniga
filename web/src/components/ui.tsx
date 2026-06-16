import type { ReactNode } from 'react'
import { IconAlert, IconInfo } from './icons'

export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-line bg-white p-5 shadow-card ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Row({
  label,
  value,
  strong,
  hint,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  hint?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className={`text-sm ${strong ? 'font-medium text-ink' : 'text-muted'}`}>
        {label}
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </span>
      <span className={`tnum whitespace-nowrap text-sm ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const Icon = tone === 'warn' ? IconAlert : IconInfo
  const cls =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-warn'
      : 'border-brand-100 bg-brand-50 text-brand-600'
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="leading-relaxed text-slate-700">{children}</div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'
