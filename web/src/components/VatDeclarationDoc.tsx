import type { Org } from '../state/orgStore'
import type { VatResult } from '../lib/taxcore'
import { sumVat, type VatBooks, type VatBookLine } from '../lib/vatBooks'
import { Cells, OfficialTop, OfficialNote } from './officialForm'

/** Код строки «стоимость без налога по ставке» (раздел 9). */
const BASE_CODE: Record<number, string> = { 22: '170', 20: '175', 18: '175', 10: '180', 7: '181', 5: '182', 0: '190' }
/** Код строки «сумма налога по ставке» (раздел 9). */
const VAT_CODE: Record<number, string> = { 22: '200', 20: '205', 18: '205', 10: '210', 7: '211', 5: '212' }
/** Итоговые коды по книге продаж: стоимость без налога / сумма налога по ставке. */
const TOT_BASE: Record<number, string> = { 22: '230', 20: '235', 18: '235', 10: '240', 7: '241', 5: '242', 0: '250' }
const TOT_VAT: Record<number, string> = { 22: '260', 20: '265', 18: '265', 10: '270', 7: '271', 5: '272' }

const lbl = 'text-[11px] text-slate-600'
const code = (c: string) => <span className="ml-1 font-mono text-[10px] text-slate-400">{c}</span>

/** Сумма в клетки: рубли (право) + «.» + 2 копейки. */
function SumCells({ amount, rubCells = 15 }: { amount: number; rubCells?: number }) {
  const rub = String(Math.trunc(amount)).padStart(rubCells, ' ')
  const kop = String(Math.round((amount - Math.trunc(amount)) * 100)).padStart(2, '0')
  return (
    <span className="inline-flex items-center gap-1">
      <Cells value={rub} count={rubCells} />
      <span className="font-semibold">.</span>
      <Cells value={kop} count={2} />
    </span>
  )
}

/** Дата ISO → клетки ДД.ММ.ГГГГ. */
function DateCells({ iso }: { iso: string }) {
  const [y = '', m = '', d = ''] = (iso || '').split('-')
  return (
    <span className="inline-flex items-center gap-0.5">
      <Cells value={d} count={2} />.<Cells value={m} count={2} />.<Cells value={y} count={4} />
    </span>
  )
}

/** Один счёт-фактура в книге продаж (раздел 9) — официальные коды строк. */
function SalesEntry({ line }: { line: VatBookLine }) {
  const base = line.withVat - line.vat
  const innDigits = (line.partyInn || '').replace(/\D/g, '')
  const Row = ({ label, c, children }: { label: string; c: string; children: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-2 py-0.5">
      <span className={`${lbl} min-w-[280px] flex-1`}>
        {label}
        {code(c)}
      </span>
      {children}
    </div>
  )
  return (
    <div className="border border-slate-400 p-2">
      <Row label="Порядковый номер" c="005">
        <Cells value={String(line.num)} count={3} />
      </Row>
      <Row label="Код вида операции" c="010">
        <Cells value="01" count={2} />
      </Row>
      <Row label="Номер счёта-фактуры продавца" c="020">
        <Cells value={line.docNumber} count={12} />
      </Row>
      <Row label="Дата счёта-фактуры продавца" c="030">
        <DateCells iso={line.date} />
      </Row>
      <Row label={`ИНН / КПП покупателя (${line.party || '—'})`} c="100">
        <Cells value={innDigits} count={12} />
      </Row>
      <Row label="Стоимость продаж по счёту-фактуре, включая налог" c="160">
        <SumCells amount={line.withVat} />
      </Row>
      <Row label={`Стоимость продаж без налога по ставке ${line.rate}%`} c={BASE_CODE[line.rate] ?? '182'}>
        <SumCells amount={base} />
      </Row>
      <Row label={`Сумма налога по ставке ${line.rate}%`} c={VAT_CODE[line.rate] ?? '212'}>
        <SumCells amount={line.vat} />
      </Row>
    </div>
  )
}

/** Печатная декларация по НДС (КНД 1151001) — официальный клеточный бланк: титул,
 *  раздел 1 (к уплате), раздел 9 (книга продаж по счетам-фактурам + итоги). */
export function VatDeclarationDoc({ org, vat, books }: { org: Org; vat: VatResult; books?: VatBooks }) {
  const rate = vat.rate.toNumber()
  const sales = books?.sales ?? []
  const tot = sumVat(sales)
  const totBase = tot.withVat - tot.vat

  if (vat.exempt) {
    return (
      <div className="text-[12px]">
        <OfficialTop code="1151001" inn={org.inn} kpp="" page="001" />
        <div className="text-[10px] text-slate-500">Форма по КНД 1151001</div>
        <div className="mt-1 text-center text-sm font-semibold">
          Налоговая декларация по налогу на добавленную стоимость
        </div>
        <p className="mt-5 text-sm text-slate-600">
          Организация освобождена от НДС (ст. 145 НК РФ) — декларация по НДС не подаётся.
        </p>
        <OfficialNote />
      </div>
    )
  }
  if (vat.mode === 'usn_lost') {
    return (
      <div className="text-[12px]">
        <OfficialTop code="1151001" inn={org.inn} kpp="" page="001" />
        <p className="mt-5 text-sm text-slate-600">
          Доход превысил лимит УСН — НДС считается по общей системе (ОСНО).
        </p>
        <OfficialNote />
      </div>
    )
  }

  return (
    <div className="text-[12px]">
      {/* ───────── Титульный лист ───────── */}
      <OfficialTop code="1151001" inn={org.inn} kpp="" page="001" />
      <div className="text-[10px] text-slate-500">Форма по КНД 1151001</div>
      <div className="mt-1 text-center text-sm font-semibold">
        Налоговая декларация по налогу на добавленную стоимость
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={lbl}>Номер корректировки</span>
          <Cells value="0--" count={3} />
          <span className={`${lbl} ml-3`}>Налоговый период (код)</span>
          <Cells count={2} />
          <span className={`${lbl} ml-3`}>Отчётный год</span>
          <Cells value={String(org.year)} count={4} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={lbl}>Представляется в налоговый орган (код)</span>
          <Cells value={org.taxOfficeCode} count={4} />
          <span className={`${lbl} ml-3`}>По месту нахождения (учёта) (код)</span>
          <Cells value="116" count={3} />
        </div>
        <div className="text-[11px]">
          Налогоплательщик: <span className="font-medium">{org.fio || org.name || '—'}</span>
        </div>
      </div>

      {/* ───────── Раздел 1 ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code="1151001" inn={org.inn} kpp="" page="002" />
        <div className="mb-2 text-[12px] font-semibold">
          Раздел 1. Сумма налога, подлежащая уплате в бюджет
        </div>
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          <span className={`${lbl} min-w-[280px] flex-1`}>Код по ОКТМО{code('010')}</span>
          <Cells value={org.oktmo || ''} count={11} />
        </div>
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          <span className={`${lbl} min-w-[280px] flex-1`}>Код бюджетной классификации{code('020')}</span>
          <Cells value="18210301000011000110" count={20} />
        </div>
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          <span className={`${lbl} min-w-[280px] flex-1`}>
            Сумма налога к уплате (п.1 ст.173 НК){code('040')}
          </span>
          <Cells value={String(Math.round(vat.vat.toNumber())).padStart(15, ' ')} count={15} />
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Ставка {rate}% (УСН-плательщик НДС){vat.mode === 'rate5' || vat.mode === 'rate7' ? ', без вычета входящего НДС (ст. 170 НК)' : ''}.
        </p>
      </div>

      {/* ───────── Раздел 9 — книга продаж ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code="0031 7160" inn={org.inn} kpp="" page="003" />
        <div className="mb-2 text-[12px] font-semibold leading-snug">
          Раздел 9. Сведения из книги продаж об операциях, отражаемых за истекший налоговый период
        </div>
        {sales.length === 0 ? (
          <div className="rounded border border-slate-300 p-3 text-[11px] text-slate-500">
            Нет счетов-фактур (документов с НДС) за период. Книга продаж пуста.
          </div>
        ) : (
          <div className="space-y-2">
            {sales.map((l) => (
              <SalesEntry key={l.num} line={l} />
            ))}
            {/* Итоги по книге продаж */}
            <div className="border-2 border-slate-500 p-2">
              <div className="mb-1 text-[11px] font-semibold">Итоговые данные по книге продаж</div>
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <span className={`${lbl} min-w-[280px] flex-1`}>
                  Всего стоимость продаж без налога по ставке {rate}%{code(TOT_BASE[rate] ?? '242')}
                </span>
                <SumCells amount={totBase} />
              </div>
              <div className="flex flex-wrap items-center gap-2 py-0.5">
                <span className={`${lbl} min-w-[280px] flex-1`}>
                  Всего сумма налога по книге продаж по ставке {rate}%{code(TOT_VAT[rate] ?? '272')}
                </span>
                <SumCells amount={tot.vat} />
              </div>
            </div>
          </div>
        )}
      </div>

      <OfficialNote extra="Раздел 9 — из книги продаж (счета-фактуры с НДС). Реальная подача НДС — через оператора ЭДО." />
    </div>
  )
}
