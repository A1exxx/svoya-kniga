import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OrgProvider } from './state/orgStore'
import { OpsProvider } from './state/opsStore'
import { DocsProvider } from './state/docsStore'
import { ContractorsProvider } from './state/contractorsStore'
import { GoodsProvider } from './state/goodsStore'
import { EmployeesProvider } from './state/employeesStore'
import { ArchiveProvider } from './state/archiveStore'
import { TaxOfficeProvider } from './state/taxOfficeStore'
import { PaymentsProvider } from './state/paymentsStore'
import { applyOverrides } from './state/paramsStore'
import { maybeAutoSnapshot } from './lib/storage/storeAdmin'
import { recoverFromIdb } from './lib/storage/idb'
import { applyTheme } from './lib/theme'
import { installGlobalErrorHandlers, logError } from './lib/errorLog'
import { ErrorBoundary } from './components/ErrorBoundary'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <OrgProvider>
          <OpsProvider>
            <ContractorsProvider>
              <GoodsProvider>
                <EmployeesProvider>
                  <DocsProvider>
                    <ArchiveProvider>
                      <TaxOfficeProvider>
                        <PaymentsProvider>
                          <App />
                        </PaymentsProvider>
                      </TaxOfficeProvider>
                    </ArchiveProvider>
                  </DocsProvider>
                </EmployeesProvider>
              </GoodsProvider>
            </ContractorsProvider>
          </OpsProvider>
        </OrgProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Перехват ошибок рантайма (window.error + unhandledrejection) → журнал ошибок + консоль.
installGlobalErrorHandlers()

// Восстанавливаем данные из IndexedDB-зеркала (если localStorage очищали), затем рендерим.
// Ошибка инициализации НЕ должна оставлять пустой экран — рендерим в любом случае.
async function boot() {
  try {
    applyTheme() // тема до рендера (без вспышки)
    await recoverFromIdb()
    applyOverrides() // локальные правки параметров до первого рендера
    maybeAutoSnapshot() // автоснимок раз в сутки (защита от потери)
  } catch (e) {
    console.error('[svoyakniga] Ошибка инициализации (приложение всё равно запускается):', e)
    logError({ kind: 'error', message: 'Ошибка инициализации: ' + (e as Error)?.message, stack: (e as Error)?.stack })
  }
  render()
}

void boot()
