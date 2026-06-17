/**
 * Абстракция канала обмена с ФНС/СФР.
 *
 * Сейчас активна одна реализация — `ManualImitationGateway` (ручной ввод + статусы «имитация»).
 * Это позволяет позже подключить РЕАЛЬНЫЕ варианты БЕЗ переписывания экранов:
 *   1. LkFnsGateway     — вход в ЛК ФНС клиента по его КЭП (нужен серверный слой + CryptoPro);
 *   2. OperatorApiGateway — API аккредитованного оператора ЭДО (Контур/Астрал/СБИС): ИОН-запросы,
 *      приём требований, отправка отчётности.
 * Получить сальдо ЕНС, сверку и письма «по ИНН» без аутентификации владельца нельзя —
 * это налоговая тайна (ст. 102 НК РФ). См. docs/FNS-INTEGRATION.md.
 */

export type ReconciliationKind = 'saldo' | 'allocation' | 'act' // справка сальдо / принадлежности / акт сверки

export const RECONCILIATION_LABEL: Record<ReconciliationKind, string> = {
  saldo: 'Справка о сальдо ЕНС (КНД 1160082)',
  allocation: 'Справка о принадлежности сумм ЕНП (КНД 1120525)',
  act: 'Акт сверки принадлежности сумм (КНД 1166112)',
}

export interface EnsBalance {
  date: string // YYYY-MM-DD
  saldo: number // > 0 переплата, < 0 долг
  note?: string
}

export interface SubmitResult {
  ok: boolean
  message: string
  imitation: boolean
}

export interface FnsGateway {
  readonly id: 'manual' | 'lk-fns' | 'operator'
  readonly label: string
  readonly available: boolean
  /** Автоматически получить сальдо ЕНС (null — недоступно в текущей реализации). */
  getEnsBalance(): Promise<EnsBalance | null>
  /** Заказать сверку с налоговой. */
  requestReconciliation(kind: ReconciliationKind): Promise<SubmitResult>
  /** Отправить документ (декларация/уведомление/ответ на требование). */
  submit(docTitle: string): Promise<SubmitResult>
}

/** Текущая реализация: всё вручную, отправка — имитация. */
export class ManualImitationGateway implements FnsGateway {
  readonly id = 'manual' as const
  readonly label = 'Ручной ввод + имитация отправки'
  readonly available = true

  async getEnsBalance(): Promise<EnsBalance | null> {
    // Автосинхронизация недоступна без оператора ЭДО — сальдо вносится вручную из ЛК ФНС.
    return null
  }
  async requestReconciliation(kind: ReconciliationKind): Promise<SubmitResult> {
    return {
      ok: true,
      imitation: true,
      message: `Запрошено: ${RECONCILIATION_LABEL[kind]} (имитация отправки ИОН по ТКС). Ответ ФНС появится в ЛК.`,
    }
  }
  async submit(docTitle: string): Promise<SubmitResult> {
    return { ok: true, imitation: true, message: `«${docTitle}» — имитация отправки в ФНС.` }
  }
}

/** Заглушка: вход в ЛК ФНС по КЭП клиента (реализуется на серверном этапе). */
export class LkFnsGateway implements FnsGateway {
  readonly id = 'lk-fns' as const
  readonly label = 'Вход в ЛК ФНС по КЭП (в разработке)'
  readonly available = false
  async getEnsBalance(): Promise<EnsBalance | null> {
    throw new Error('LkFnsGateway в разработке: требуется КЭП и серверный крипто-слой.')
  }
  async requestReconciliation(): Promise<SubmitResult> {
    throw new Error('LkFnsGateway в разработке.')
  }
  async submit(): Promise<SubmitResult> {
    throw new Error('LkFnsGateway в разработке.')
  }
}

/** Заглушка: API оператора ЭДО (продуктовый путь). */
export class OperatorApiGateway implements FnsGateway {
  readonly id = 'operator' as const
  readonly label = 'API оператора ЭДО (в разработке)'
  readonly available = false
  async getEnsBalance(): Promise<EnsBalance | null> {
    throw new Error('OperatorApiGateway в разработке: нужен договор с оператором ЭДО.')
  }
  async requestReconciliation(): Promise<SubmitResult> {
    throw new Error('OperatorApiGateway в разработке.')
  }
  async submit(): Promise<SubmitResult> {
    throw new Error('OperatorApiGateway в разработке.')
  }
}

/** Активный шлюз. Пока всегда ручной/имитация; позже — выбор по настройке. */
export function activeGateway(): FnsGateway {
  return new ManualImitationGateway()
}
