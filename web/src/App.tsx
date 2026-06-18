import { lazy } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'

// Дашборд грузим сразу (стартовый экран), остальные страницы — лениво (code-splitting).
// Suspense-граница — внутри Layout вокруг <Outlet/>, чтобы боковое меню не мигало при загрузке.
const Taxes = lazy(() => import('./pages/Taxes').then((m) => ({ default: m.Taxes })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Requisites = lazy(() => import('./pages/Requisites').then((m) => ({ default: m.Requisites })))
const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })))
const Money = lazy(() => import('./pages/Money').then((m) => ({ default: m.Money })))
const Payments = lazy(() => import('./pages/Payments').then((m) => ({ default: m.Payments })))
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })))
const Contractors = lazy(() => import('./pages/Contractors').then((m) => ({ default: m.Contractors })))
const Goods = lazy(() => import('./pages/Goods').then((m) => ({ default: m.Goods })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Patent = lazy(() => import('./pages/Patent').then((m) => ({ default: m.Patent })))
const Archive = lazy(() => import('./pages/Archive').then((m) => ({ default: m.Archive })))
const TaxOffice = lazy(() => import('./pages/TaxOffice').then((m) => ({ default: m.TaxOffice })))
const UsefulDocs = lazy(() => import('./pages/UsefulDocs').then((m) => ({ default: m.UsefulDocs })))
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/patent" element={<Patent />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/money" element={<Money />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/goods" element={<Goods />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/tax-office" element={<TaxOffice />} />
          <Route path="/useful-docs" element={<UsefulDocs />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
