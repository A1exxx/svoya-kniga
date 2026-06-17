import { Component, type ReactNode } from 'react'
import { logError, buildDiagnostics } from '../lib/errorLog'
import { downloadText } from '../lib/download'

interface State {
  error: Error | null
}

/**
 * Перехватывает ошибки рендера React: вместо белого экрана показывает понятный экран с кнопками
 * «Перезагрузить» и «Скачать диагностику», и записывает ошибку в журнал (lib/errorLog).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logError({
      kind: 'react',
      message: error.message,
      stack: `${error.stack || ''}\n--- Компоненты ---${info?.componentStack || ''}`,
      where: typeof location !== 'undefined' ? location.hash : undefined,
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-7 text-center shadow-card">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-2xl">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold text-ink">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-slate-600">
            Произошла ошибка в приложении. Ваши данные сохранены локально и не потеряны. Перезагрузите
            страницу — обычно это помогает. Если повторяется, скачайте диагностику и пришлите её нам.
          </p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Перезагрузить
            </button>
            <button
              type="button"
              onClick={() => downloadText('svoyakniga-диагностика.json', buildDiagnostics(), 'application/json;charset=utf-8')}
              className="cursor-pointer rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50"
            >
              Скачать диагностику
            </button>
          </div>
        </div>
      </div>
    )
  }
}
