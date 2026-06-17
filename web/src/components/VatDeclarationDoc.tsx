import { formatRub } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { VatResult } from '../lib/taxcore'

const r0 = (n: number) => formatRub(Math.round(n))

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
export function VatDeclarationDoc({ org, vat }: { org: Org; vat: VatResult }) {
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
        </>
      )}

      <div className="mt-6 text-[11px] text-slate-400">
        Демонстрационная форма (упрощённая). Полная декларация НДС включает книги покупок/продаж и
        подаётся через оператора ЭДО. Перед сдачей сверьте с актуальной формой ФНС.
      </div>
    </div>
  )
}
