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
import { applyOverrides } from './state/paramsStore'
import { maybeAutoSnapshot } from './lib/storage/storeAdmin'

// Применяем локальные правки параметров (если есть) до первого рендера.
applyOverrides()
// Автоснимок данных раз в сутки (защита от потери) — до рендера.
maybeAutoSnapshot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OrgProvider>
      <OpsProvider>
        <ContractorsProvider>
          <GoodsProvider>
            <EmployeesProvider>
              <DocsProvider>
                <ArchiveProvider>
                  <TaxOfficeProvider>
                    <App />
                  </TaxOfficeProvider>
                </ArchiveProvider>
              </DocsProvider>
            </EmployeesProvider>
          </GoodsProvider>
        </ContractorsProvider>
      </OpsProvider>
    </OrgProvider>
  </StrictMode>,
)
