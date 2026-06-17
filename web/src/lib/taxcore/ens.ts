/**
 * ЕНС, уведомления и налоговый календарь для ИП на УСН.
 *
 * Сроки (с переносом с выходного; госпраздники проверять отдельно):
 *   • Авансы УСН: 28 апреля / 28 июля / 28 октября (за Q1 / полугодие / 9 мес.).
 *   • Налог УСН за год (ИП): 28 апреля следующего года.
 *   • Декларация УСН (ИП): 25 апреля следующего года.
 *   • Уведомления об исчисленных авансах: 25 апреля / 25 июля / 25 октября
 *     (по году уведомление не подаётся — есть декларация).
 *   • Фиксированные взносы: 28 декабря; 1% свыше 300 000 ₽: 1 июля следующего года.
 */

import Decimal from 'decimal.js';
import { shiftToWorkday, dateToIso, makeDate } from './money.js';
import type { UsnYearResult } from './usn.js';
import type { ContributionsResult } from './vznosy.js';

export interface CalendarEvent {
  /** Дата события (YYYY-MM-DD), уже перенесена с выходных */
  due: string;
  /** Начало окна оплаты/сдачи (для задач вида «с X по Y»), опционально */
  windowStart?: string;
  /** Тип события */
  kind: 'payment' | 'report' | 'notification';
  title: string;
  amount: Decimal | null;
  note: string;
}

/** Доп. параметры календаря: наличие сотрудников и плательщик НДС → доп. сроки. */
export interface CalendarOptions {
  hasEmployees?: boolean;
  vat?: boolean;
}

/**
 * Список событий налогового календаря ИП на УСН за `taxYear`.
 *
 * Если переданы расчёты (`usn`, `contributions`) — подставляются суммы.
 * Результат отсортирован по дате.
 */
export function usnCalendar(
  taxYear: number,
  usn?: UsnYearResult,
  contributions?: ContributionsResult,
  opts: CalendarOptions = {}
): CalendarEvent[] {
  // Квартальные авансы заполняются ТОЛЬКО при полном поквартальном расчёте (ровно 4 периода).
  // При usn_quick (1 период «год») оставляем null — защита от двойного счёта годового налога.
  const has_quarterly = usn != null && usn.periods.length === 4;

  /** Аванс за i-й период (0-based, только Q1/полугодие/9мес) или null */
  function adv(i: number): Decimal | null {
    if (has_quarterly && i < 3) {
      return usn!.periods[i].advance_due_this_period;
    }
    return null;
  }

  function makeEvent(
    rawDate: Date,
    kind: CalendarEvent['kind'],
    title: string,
    amount: Decimal | null = null,
    note = '',
    windowStart?: Date
  ): CalendarEvent {
    return {
      due: dateToIso(shiftToWorkday(rawDate)),
      windowStart: windowStart ? dateToIso(windowStart) : undefined,
      kind,
      title,
      amount,
      note,
    };
  }

  const events: CalendarEvent[] = [
    makeEvent(
      makeDate(taxYear, 4, 25),
      'notification',
      'Уведомление об исчисленном авансе УСН за 1 квартал',
      adv(0)
    ),
    makeEvent(
      makeDate(taxYear, 4, 28),
      'payment',
      'Аванс по УСН за 1 квартал',
      adv(0)
    ),
    makeEvent(
      makeDate(taxYear, 7, 25),
      'notification',
      'Уведомление об исчисленном авансе УСН за полугодие',
      adv(1)
    ),
    makeEvent(
      makeDate(taxYear, 7, 28),
      'payment',
      'Аванс по УСН за полугодие',
      adv(1)
    ),
    makeEvent(
      makeDate(taxYear, 10, 25),
      'notification',
      'Уведомление об исчисленном авансе УСН за 9 месяцев',
      adv(2)
    ),
    makeEvent(
      makeDate(taxYear, 10, 28),
      'payment',
      'Аванс по УСН за 9 месяцев',
      adv(2)
    ),
    makeEvent(
      makeDate(taxYear, 12, 28),
      'payment',
      'Фиксированные страховые взносы ИП',
      contributions?.fixed ?? null,
      'можно платить частями в течение года',
      makeDate(taxYear, 12, 1)
    ),
    makeEvent(
      makeDate(taxYear + 1, 4, 25),
      'report',
      'Декларация по УСН за год',
      null,
      'Подаётся в ФНС'
    ),
    makeEvent(
      makeDate(taxYear + 1, 4, 28),
      'payment',
      'Налог по УСН за год (доплата)',
      usn?.year_payment_due ?? null
    ),
    makeEvent(
      makeDate(taxYear + 1, 7, 1),
      'payment',
      'Взносы ИП 1% с дохода свыше 300 000 ₽',
      contributions?.one_percent ?? null
    ),
  ];

  // Отчётность за сотрудников (когда есть штат).
  if (opts.hasEmployees) {
    events.push(
      makeEvent(makeDate(taxYear + 1, 1, 25), 'report', 'РСВ за год', null, 'Расчёт по страховым взносам, в ФНС'),
      makeEvent(makeDate(taxYear + 1, 1, 25), 'report', 'ЕФС-1 за год', null, 'в СФР'),
      makeEvent(makeDate(taxYear + 1, 2, 25), 'report', '6-НДФЛ за год', null, 'в ФНС'),
    );
  }

  // НДС поквартально (когда плательщик НДС).
  if (opts.vat) {
    events.push(
      makeEvent(makeDate(taxYear + 1, 1, 25), 'report', 'Декларация по НДС за 4 квартал', null, 'поквартально, через оператора ЭДО'),
      makeEvent(makeDate(taxYear + 1, 1, 28), 'payment', 'Уплата НДС за 4 квартал', null, 'НДС платится поквартально до 28 числа'),
    );
  }

  // Если по итогам года образовалась переплата — отдельным информационным событием.
  if (usn != null && usn.year_overpayment != null && usn.year_overpayment.gt(0)) {
    events.push(
      makeEvent(
        makeDate(taxYear + 1, 4, 28),
        'notification',
        'Переплата по УСН за год — к зачёту/возврату (ст. 78 НК РФ)',
        usn.year_overpayment
      )
    );
  }

  // Сортировка по дате (строки 'YYYY-MM-DD' сортируются лексикографически корректно)
  events.sort((a, b) => a.due.localeCompare(b.due));

  return events;
}
