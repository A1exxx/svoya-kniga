import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TaxProvider } from './state/store'
import { applyOverrides } from './state/paramsStore'

// Применяем локальные правки параметров (если есть) до первого рендера.
applyOverrides()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TaxProvider>
      <App />
    </TaxProvider>
  </StrictMode>,
)
