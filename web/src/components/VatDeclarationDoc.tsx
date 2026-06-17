import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { VatResult } from '../lib/taxcore'
import { sumVat, type VatBooks, type VatBookLine } from '../lib/vatBooks'

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
  return (
    <div>
      <div className="text-center text-base font-semibold">Налоговая декларация по налогу на добавленную стоимость</div>
      <div className="mt-1 text-center text-xs text-slate-500">Форма по КНД 1151001 · {org.year} год</div>
      <div className="mt-2 text-center text-[13px] text-slate-600">
        {org.fio || org.name || '—'}{org.inn && `, ИНН ${org.inn}`}
        {org.oktmo && ` · ОКТМО ${org.oktmo}`}
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
              <L code="020" label="КБК" value="182 1 03 01000 01 1000 110" />
              <L code="030" label="ОКТМО" value={org.oktmo || '—'} />
              <L code="040" label="Сумма налога к уплате" value={r0(vat.vat.toNumber())} />
            </tbody>
          </table>

          <div className="mt-5 mb-2 font-semibold">Раздел 3. Расчёт налога</div>
          <table className="w-full text-[13px]">
            <tbody>
              <L code="010" label={`Налоговая база (ставка ${rate}%)`} value={r0(vat.base.toNumber())} />
              <L code="118" label="Сумма налога исчисленная" value={r0(vat.base.toNumber() * rate / 100)} />
              {!special && (
                <L code="190" label="Налоговые вычеты (входящий НДС)" value={r0(vat.input_vat_deducted.toNumber())} />
              )}
              <L code="200" label="Итого к уплате" value={r0(vat.vat.toNumber())} />
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

      <div className="mt-6 text-[11px] text-slate-400">
        Демонстрационная форма (упрощённая). Разделы 8/9 формируются из книг покупок/продаж.
        Реальная подача НДС — через оператора ЭДО. Перед сдачей сверьте с актуальной формой ФНС.
      </div>
    </div>
  )
}
