import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { VatResult } from '../lib/taxcore'
import { sumVat, type VatBooks, type VatBookLine } from '../lib/vatBooks'
import { Cells, FormKndHeader, FormField, SignBlock, OfficialNote } from './officialForm'

/** Код строки раздела 3 по ставке НДС (по бланку КНД 1151001 ред. 2025–2026). */
const RATE_CODE: Record<number, string> = { 22: '003', 20: '010', 10: '020', 7: '021', 5: '022' }

const r0 = (n: number) => formatRub(Math.round(n))
const rk = (n: number) => formatRub(n, { kopecks: true })

/** Таблица раздела книги (8 — покупки / 9 — продажи). */
function BookSection({
  code,
  title,
  partyLabel,
  lines,
}: {
  code: string
  title: string
  partyLabel: string
  lines: VatBookLine[]
}) {
  const t = sumVat(lines)
  return (
    <>
      <div className="mt-5 mb-2 font-semibold">
        {code}. {title}
      </div>
      {lines.length === 0 ? (
        <p className="text-[12px] text-slate-500">Нет документов с НДС за период.</p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th className="w-8 py-1 pr-2 font-semibold">№</th>
              <th className="py-1 pr-2 font-semibold">Документ</th>
              <th className="py-1 pr-2 font-semibold">Дата</th>
              <th className="py-1 pr-2 font-semibold">{partyLabel}</th>
              <th className="py-1 pr-2 text-right font-semibold">Стоимость с НДС</th>
              <th className="py-1 pr-2 text-right font-semibold">Ставка</th>
              <th className="py-1 text-right font-semibold">НДС</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.num} className="border-b border-slate-200 align-top">
                <td className="py-1 pr-2">{l.num}</td>
                <td className="py-1 pr-2">{l.doc}</td>
                <td className="tnum py-1 pr-2">{formatDate(l.date)}</td>
                <td className="py-1 pr-2">{l.party}</td>
                <td className="tnum py-1 pr-2 text-right">{rk(l.withVat)}</td>
                <td className="tnum py-1 pr-2 text-right">{l.rate}%</td>
                <td className="tnum py-1 text-right">{rk(l.vat)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1 pr-2" colSpan={4}>
                Итого
              </td>
              <td className="tnum py-1 pr-2 text-right">{rk(t.withVat)}</td>
              <td />
              <td className="tnum py-1 text-right">{rk(t.vat)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

function L({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-16 py-1.5 align-top font-mono text-xs text-slate-500">{code}</td>
      <td className="py-1.5 pr-3 align-top">{label}</td>
      <td className="tnum w-44 py-1.5 text-right align-top font-medium">{value}</td>
    </tr>
  )
}

/** Печатная форма декларации по НДС (КНД 1151001), упрощённо для ИП на УСН-плательщика. */
export function VatDeclarationDoc({ org, vat, books }: { org: Org; vat: VatResult; books?: VatBooks }) {
  const rate = vat.rate.toNumber()
  const special = vat.mode === 'rate5' || vat.mode === 'rate7'
  const rateCode = RATE_CODE[rate] ?? '010'
  const assessed = Math.round((vat.base.toNumber() * rate) / 100)
  return (
    <div>
      <FormKndHeader
        knd="1151001"
        title="Налоговая декларация по налогу на добавленную стоимость"
        inn={org.inn}
      />
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <FormField label="Номер корректировки">
          <Cells value="0" count={3} />
        </FormField>
        <FormField label="Налоговый период (код квартала)">
          <Cells count={2} />
        </FormField>
        <FormField label="Представляется в налоговый орган (код)">
          <Cells value={org.taxOfficeCode} count={4} />
        </FormField>
        <FormField label="Отчётный (календарный) год">
          <Cells value={String(org.year)} count={4} />
        </FormField>
        <FormField label="По месту нахождения (учёта) (код)">
          <span className="text-[12px]">116 — по месту учёта ИП</span>
        </FormField>
        <FormField label="Налогоплательщик">
          <span className="text-[12px]">{org.fio || org.name || '—'}</span>
        </FormField>
      </div>

      {vat.exempt ? (
        <p className="mt-5 text-sm text-slate-600">
          Организация освобождена от НДС — декларация не подаётся (ст. 145 НК РФ).
        </p>
      ) : vat.mode === 'usn_lost' ? (
        <p className="mt-5 text-sm text-slate-600">
          Доход превысил лимит УСН — НДС считается по общей системе. Сформируйте декларацию по ОСНО.
        </p>
      ) : (
        <>
          <div className="mt-5 mb-2 font-semibold">Раздел 1. Сумма налога к уплате в бюджет</div>
          <table className="w-full text-[13px]">
            <tbody>
              <L code="010" label="КБК" value="182 1 03 01000 01 1000 110" />
              <L code="020" label="Код по ОКТМО" value={org.oktmo || '—'} />
              <L code="040" label="Сумма налога к уплате (п. 1 ст. 173 НК)" value={r0(vat.vat.toNumber())} />
            </tbody>
          </table>

          <div className="mt-5 mb-2 font-semibold">Раздел 3. Расчёт суммы налога</div>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-y border-slate-300 text-left">
                <th className="py-1 pr-2 font-semibold">Объект налогообложения</th>
                <th className="w-20 py-1 pr-2 font-semibold">Код строки</th>
                <th className="py-1 pr-2 text-right font-semibold">Налоговая база</th>
                <th className="w-16 py-1 pr-2 text-right font-semibold">Ставка</th>
                <th className="py-1 text-right font-semibold">Сумма НДС</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-1.5 pr-2">Реализация товаров (работ, услуг), передача прав</td>
                <td className="py-1.5 pr-2 font-mono">{rateCode}</td>
                <td className="tnum py-1.5 pr-2 text-right">{r0(vat.base.toNumber())}</td>
                <td className="py-1.5 pr-2 text-right">{rate}%</td>
                <td className="tnum py-1.5 text-right">{r0(assessed)}</td>
              </tr>
              <tr className="border-b border-slate-200 font-medium">
                <td className="py-1.5 pr-2" colSpan={4}>
                  Итого сумма налога, исчисленная (стр. 118)
                </td>
                <td className="tnum py-1.5 text-right">{r0(assessed)}</td>
              </tr>
              {!special && (
                <tr className="border-b border-slate-200">
                  <td className="py-1.5 pr-2" colSpan={4}>
                    Налоговые вычеты, всего — входящий НДС (стр. 190)
                  </td>
                  <td className="tnum py-1.5 text-right">{r0(vat.input_vat_deducted.toNumber())}</td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td className="py-1.5 pr-2" colSpan={4}>
                  Итого к уплате в бюджет (стр. 200)
                </td>
                <td className="tnum py-1.5 text-right">{r0(vat.vat.toNumber())}</td>
              </tr>
            </tbody>
          </table>
          {special && (
            <p className="mt-3 text-[12px] text-slate-600">
              Специальная ставка {rate}% применяется без вычета входящего НДС (ст. 170 НК РФ).
            </p>
          )}

          {books && (
            <BookSection
              code="Раздел 9"
              title="Сведения из книги продаж"
              partyLabel="Покупатель"
              lines={books.sales}
            />
          )}
          {books && !special && (
            <BookSection
              code="Раздел 8"
              title="Сведения из книги покупок (вычеты)"
              partyLabel="Поставщик"
              lines={books.purchases}
            />
          )}
        </>
      )}

      {!vat.exempt && vat.mode !== 'usn_lost' && <SignBlock name={org.fio || org.name} />}
      <OfficialNote extra="Разделы 8/9 — из книг покупок/продаж. Реальная подача НДС — через оператора ЭДО." />
    </div>
  )
}
