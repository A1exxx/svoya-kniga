import { IconInfo } from '../components/icons'

/** Заглушка для разделов «в разработке». */
export function Stub({ title, planned }: { title: string; planned?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-card">
        <div className="flex items-center gap-2 text-warn">
          <IconInfo size={20} />
          <span className="text-sm font-medium uppercase tracking-wide">В разработке</span>
        </div>
        <p className="mt-3 text-ink">
          Этот раздел появится в следующих версиях. Сейчас приложение фокусируется на
          калькуляторах и отчётности по УСН — их можно проверять в боевом режиме.
        </p>
        {planned && <p className="mt-2 text-sm text-muted">{planned}</p>}
      </div>
    </div>
  )
}
