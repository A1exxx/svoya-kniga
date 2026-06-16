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
import { applyOverrides } from './state/paramsStore'

// Применяем локальные правки параметров (если есть) до первого рендера.
applyOverrides()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OrgProvider>
      <OpsProvider>
        <ContractorsProvider>
          <GoodsProvider>
            <EmployeesProvider>
              <DocsProvider>
                <App />
              </DocsProvider>
            </EmployeesProvider>
          </GoodsProvider>
        </ContractorsProvider>
      </OpsProvider>
    </OrgProvider>
  </StrictMode>,
)
