import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg, type Org, type OrgVatMode, type TaxSystem } from '../state/orgStore'
import { type UsnObject, calcVatUsn, getParams } from '../lib/taxcore'
import { getDadataToken, isValidInnLength, lookupInn } from '../lib/innLookup'
import { isPlaceholderName, orgDisplayName, requisitesProgress } from '../lib/orgDisplay'
import { validateInn, validateOktmo, validateOgrnip } from '../lib/validation'
import { Card, Field, Note, inputClass } from '../components/ui'

/** Выбор ставки НДС — применяется сквозь всё приложение (счета, декларация, книга продаж). */
function VatRateSelect({ o, onChange }: { o: Org; onChange: (m: OrgVatMode) => void }) {
  const generalRate = getParams(o.year).vat_general_rate.toNumber()
  const options: { value: OrgVatMode; label: string }[] = [
    { value: 'auto', label: 'Авто (по доходу)' },
    { value: 'none', label: 'Освобождение / без НДС' },
    { value: 'rate5', label: '5% (без вычета)' },
    { value: 'rate7', label: '7% (без вычета)' },
    { value: 'rate10', label: '10% (льготные товары)' },
    { value: 'general', label: `Общая ${generalRate}% (с вычетом)` },
  ]
  let recommend = ''
  try {
    const r = calcVatUsn(o.year, o.income, { mode: 'auto' })
    recommend = r.exempt ? 'по доходу — освобождение' : `по доходу рекомендуется ${r.rate.toNumber()}%`
  } catch {
    recommend = ''
  }
  return (
    <div className="ml-7 mt-1 max-w-md rounded-lg border border-line bg-slate-50/60 p-3">
      <Field label="Ставка НДС" hint={recommend}>
        <select
          className={inputClass}
          value={o.vatMode}
          onChange={(e) => onChange(e.target.value as OrgVatMode)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="mt-2 text-xs text-muted">
        Выбранная ставка подставляется в новые счета и используется в декларации по НДС и книге
        продаж. С 2026 общая ставка — {generalRate}% (ФЗ № 425-ФЗ).
      </p>
    </div>
  )
}

export function Requisites() {
  const { activeOrg, updateActiveOrg } = useOrg()
  const navigate = useNavigate()
  const o = activeOrg
  const [busy, setBusy] = useState(false)
  const [innMsg, setInnMsg] = useState<string | null>(null)
  const progress = requisitesProgress(o)

  // Базовые ставки УСН — из параметров года («Настройки»), а не захардкожены.
  // Эффективная ставка = региональная (если задана) или базовая для объекта.
  const yp = (() => {
    try {
      return getParams(o.year)
    } catch {
      return null
    }
  })()
  const baseIncomeRate = yp ? Number((yp.usn_income_rate.toNumber() * 100).toFixed(2)) : 6
  const baseMinusRate = yp ? Number((yp.usn_income_minus_rate.toNumber() * 100).toFixed(2)) : 15
  const baseRate = o.usnObject === 'income' ? baseIncomeRate : baseMinusRate
  const effectiveRate = o.regionalRate != null ? o.regionalRate : baseRate
  const generalVatRate = yp ? yp.vat_general_rate.toNumber() : 22
  const issues = [
    validateInn(o.inn),
    validateOktmo(o.oktmo),
    validateOgrnip(o.ogrnip),
  ].filter((x): x is string => !!x)

  // Если «Краткое название» осталось плейсхолдером — подставляем «ИП {ФИО/ИНН}»,
  // чтобы ИП был виден в списке слева. Вызывается на blur ФИО и ИНН.
  const backfillName = () => {
    if (!isPlaceholderName(o.name)) return
    const auto = orgDisplayName(o)
    if (auto !== 'Без названия' && auto !== o.name) updateActiveOrg({ name: auto })
  }

  const onLookup = async () => {
    if (!isValidInnLength(o.inn)) {
      setInnMsg('Введите ИНН: 10 цифр для организации или 12 для ИП.')
      return
    }
    setBusy(true)
    setInnMsg(null)
    const info = await lookupInn(o.inn)
    setBusy(false)
    if (!info) {
      setInnMsg(
        getDadataToken()
          ? 'По этому ИНН ничего не найдено.'
          : 'Демо-ИНН не распознан. Чтобы работали любые ИНН — укажите бесплатный ключ DaData в «Настройках».'
      )
      return
    }
    const patch: Partial<Org> = {
      address: info.address || o.address,
      ogrnip: info.ogrn || o.ogrnip,
    }
    if (info.type === 'ip') {
      patch.fio = info.name
      if (isPlaceholderName(o.name)) patch.name = info.name
    } else {
      patch.name = info.name
    }
    updateActiveOrg(patch)
    setInnMsg('Реквизиты заполнены по ИНН ✓')
  }

  const onImage = (key: 'logo' | 'signature' | 'stamp', file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateActiveOrg({ [key]: reader.result as string } as Partial<Org>)
    reader.readAsDataURL(file)
  }

  const text = (
    key: keyof typeof o,
    label: string,
    placeholder = '',
    hint?: string,
    onBlur?: () => void
  ) => (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={(o[key] as string) ?? ''}
        onChange={(e) => updateActiveOrg({ [key]: e.target.value } as never)}
        onBlur={onBlur}
      />
    </Field>
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Реквизиты</h1>
          <p className="mt-1 text-sm text-muted">
            Данные ИП, банк и система налогообложения. Используются в расчётах и документах.
            Переключить или добавить ИП можно слева внизу.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 font-medium text-ok">
              Сохранено ✓ <span className="font-normal text-muted">— изменения сохраняются автоматически</span>
            </span>
            <span className={progress.missing.length ? 'text-warn' : 'text-ok'}>
              Заполнено {progress.filled} из {progress.total}
              {progress.missing.length > 0 && (
                <span className="text-muted"> · не хватает: {progress.missing.join(', ')}</span>
              )}
            </span>
            {issues.length > 0 && <span className="text-danger">⚠ {issues.join('; ')}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onLookup}
              disabled={busy}
              className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
            >
              {busy ? 'Поиск…' : 'Заполнить по ИНН'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Готово
            </button>
          </div>
          {innMsg && <span className="max-w-[280px] text-right text-xs text-muted">{innMsg}</span>}
        </div>
      </header>

      {progress.missing.length > 0 && (
        <div className="mb-5">
          <Note tone="info">
            <strong>Начните отсюда.</strong> Заполните данные ИП — они автоматически подставятся во
            все счета, расчёты и отчёты. Достаточно ИНН и ФИО (можно нажать «Заполнить по&nbsp;ИНН» —
            остальное подтянется). Всё сохраняется само; по кнопке «Готово» вернётесь к задачам.
          </Note>
        </div>
      )}

      <div className="space-y-5">
        <Card title="Организация">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', 'Краткое название', 'ИП Иванов', 'для списка слева; заполнится само по ФИО')}
            {text('fio', 'ФИО предпринимателя', 'Иванов Иван Иванович', undefined, backfillName)}
            {text('inn', 'ИНН', '123456789012', undefined, backfillName)}
            {text('ogrnip', 'ОГРНИП', '312345678901234')}
            <Field label="Дата регистрации" hint="влияет на расчёт взносов за неполный год">
              <input
                type="date"
                className={inputClass}
                value={o.regDate || ''}
                onChange={(e) => updateActiveOrg({ regDate: e.target.value })}
              />
            </Field>
            {text('okved', 'Основной ОКВЭД', '62.01')}
            {text('oktmo', 'ОКТМО', '45000000', 'код территории — нужен в уведомлениях ЕНС')}
            {text('okpo', 'ОКПО', '12345678')}
            {text('taxOfficeCode', 'Код налоговой (ИФНС)', '7707', 'код вашей инспекции — в формах ФНС')}
            {text('phone', 'Телефон', '+7 999 123-45-67')}
            <div className="sm:col-span-2">{text('address', 'Адрес', 'г. Москва, ...')}</div>
          </div>
        </Card>

        <Card title="Расчётный счёт">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('bankAccount', 'Расчётный счёт', '40802810...')}
            {text('bik', 'БИК банка', '044525...')}
            {text('corrAccount', 'Корр. счёт банка', '30101810...', 'Сч. № банка в платёжке и счёте')}
            {text('bankName', 'Название банка', 'Т-Банк / Сбербанк / ...')}
          </div>
        </Card>

        <Card title="Электронная подпись (КЭП)">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('espOwner', 'Владелец / серийный № сертификата', 'Иванов И.И. / 01 23 45 …')}
            <Field label="Срок действия КЭП" hint="до этой даты подпись действительна">
              <input
                type="date"
                className={inputClass}
                value={o.espValidTo || ''}
                onChange={(e) => updateActiveOrg({ espValidTo: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Note>
              Подпись КЭП и отправка в ФНС — серверный этап. Здесь храним данные сертификата для
              справки и контроля срока действия.
            </Note>
          </div>
        </Card>

        <Card title="Брендинг для счетов и актов">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['logo', 'Логотип'],
                ['signature', 'Подпись (факсимиле)'],
                ['stamp', 'Печать'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <div className="mb-1.5 text-sm font-medium text-ink">{label}</div>
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-line bg-slate-50">
                  {o[key] ? (
                    <img src={o[key]} alt={label} className="max-h-16 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted">не загружено</span>
                  )}
                </div>
                <div className="mt-1.5 flex gap-2">
                  <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
                    Загрузить
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onImage(key, e.target.files?.[0])}
                    />
                  </label>
                  {o[key] && (
                    <button
                      type="button"
                      onClick={() => updateActiveOrg({ [key]: undefined } as Partial<Org>)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-danger"
                    >
                      Убрать
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Note>
              Логотип появится в шапке счёта/акта, подпись и печать — у строки подписи. Тогда счёт
              можно отправить клиенту без ручной печати-подписи-скана. Картинки до ~300 КБ, хранятся
              локально.
            </Note>
          </div>
        </Card>

        <Card title="Система налогообложения">
          <div className="space-y-4">
            <Field label="Система">
              <div className="grid max-w-md grid-cols-2 gap-2">
                {(
                  [
                    ['usn', 'УСН (упрощёнка)'],
                    ['osno', 'ОСНО (общая)'],
                  ] as [TaxSystem, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateActiveOrg({ taxSystem: val })}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      o.taxSystem === val
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-line text-muted hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {o.taxSystem === 'usn' ? (
              <>
                <Field label="Объект УСН">
                  <div className="grid max-w-md grid-cols-2 gap-2">
                    {(
                      [
                        ['income', `Доходы ${baseIncomeRate}%`],
                        ['income_minus', `Доходы − расходы ${baseMinusRate}%`],
                      ] as [UsnObject, string][]
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => updateActiveOrg({ usnObject: val })}
                        className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          o.usnObject === val
                            ? 'border-brand-500 bg-brand-50 text-brand-600'
                            : 'border-line text-muted hover:border-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field
                  label="Региональная ставка, %"
                  hint="оставьте пустым — возьмётся базовая; регион может снизить (доходы до 1%, Д−Р до 5%)"
                >
                  <input
                    type="number"
                    step="any"
                    min={0}
                    className={`${inputClass} max-w-[180px]`}
                    placeholder={`базовая ${baseRate}%`}
                    value={o.regionalRate ?? ''}
                    onChange={(e) =>
                      updateActiveOrg({
                        regionalRate:
                          e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </Field>

                <div className="max-w-md rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-sm">
                  <span className="text-muted">Применяется ставка: </span>
                  <span className="font-semibold text-brand-600">{effectiveRate}%</span>
                  <p className="mt-1 text-xs text-muted">
                    Базовая ставка ({baseRate}%) задаётся в «Настройках → параметры налогов по годам»
                    для {o.year} года. Если регион её снизил — впишите свою в поле выше; она
                    применится здесь и в расчёте на «Налоги».
                  </p>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                    checked={o.ausn}
                    onChange={(e) => updateActiveOrg({ ausn: e.target.checked })}
                  />
                  <span className="text-sm text-ink">
                    АУСН{' '}
                    <span className="text-muted">
                      (автоматизированная УСН — без взносов и деклараций)
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <Note tone="info">
                <strong>ОСНО — общая система налогообложения.</strong> ИП платит НДФЛ по
                прогрессивной шкале (13% до 2,4 млн ₽, далее 15/18/20/22%) с прибыли (доходы минус
                профессиональный вычет — расходы или 20% от доходов) и НДС {generalVatRate}% с
                реализации. Расчёт — на экране «Налоги». Базовый модуль; полный учёт ОСНО (КУДиР по
                приказу 86н, авансовые платежи по НДФЛ, вычет входящего НДС по счёт-фактурам) — в
                развитии. Корректность подтверждает бухгалтер.
              </Note>
            )}

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                checked={o.hasEmployees}
                onChange={(e) => updateActiveOrg({ hasEmployees: e.target.checked })}
              />
              <span className="text-sm text-ink">Есть наёмные работники</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                checked={o.tradeFee}
                onChange={(e) => updateActiveOrg({ tradeFee: e.target.checked })}
              />
              <span className="text-sm text-ink">
                Плательщик торгового сбора <span className="text-muted">(если введён в регионе)</span>
              </span>
            </label>

            {o.taxSystem === 'usn' && (
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                  checked={o.vat}
                  onChange={(e) => updateActiveOrg({ vat: e.target.checked })}
                />
                <span className="text-sm text-ink">
                  Плательщик НДС на УСН <span className="text-muted">(доход свыше порога)</span>
                </span>
              </label>
            )}

            {o.taxSystem === 'usn' && o.vat && (
              <VatRateSelect o={o} onChange={(vatMode) => updateActiveOrg({ vatMode })} />
            )}
          </div>
        </Card>

        <Note>
          Данные хранятся локально в браузере (демо-режим) и сразу применяются в расчётах. Система,
          объект и ставка отсюда используются на экране «Налоги».
        </Note>
      </div>
    </div>
  )
}
