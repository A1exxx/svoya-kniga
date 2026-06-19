import { useState } from 'react'
import { ApiError, api, type CloudUser } from '../lib/serverApi'

/** Экран входа/регистрации (серверный режим). После успеха — onAuthed(user). */
export function LoginScreen({ onAuthed }: { onAuthed: (u: CloudUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const u =
        mode === 'register'
          ? await api.register(email.trim(), password, name.trim())
          : await api.login(email.trim(), password)
      onAuthed(u)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось подключиться к серверу')
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-semibold text-white">С</div>
          <span className="text-lg font-semibold text-slate-900">СвояКнига</span>
        </div>

        <h1 className="text-xl font-semibold text-slate-900">
          {mode === 'login' ? 'Вход в кабинет' : 'Создать кабинет'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login'
            ? 'Данные хранятся на сервере и сохраняются автоматически.'
            : 'Один аккаунт — ваш кабинет со всеми ИП, доступный с любого устройства.'}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Имя</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Елена" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email (логин)</label>
            <input
              className={input}
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buh@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Пароль</label>
            <input
              className={input}
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'минимум 8 символов' : '••••••••'}
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать кабинет'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <>
              Нет аккаунта?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register')
                  setError(null)
                }}
                className="font-medium text-brand-600 hover:underline"
              >
                Создать кабинет
              </button>
            </>
          ) : (
            <>
              Уже есть кабинет?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="font-medium text-brand-600 hover:underline"
              >
                Войти
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
