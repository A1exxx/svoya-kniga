import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Taxes } from './pages/Taxes'
import { Settings } from './pages/Settings'
import { Requisites } from './pages/Requisites'
import { Employees } from './pages/Employees'
import { Money } from './pages/Money'
import { Documents } from './pages/Documents'
import { Stub } from './pages/Stub'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/money" element={<Money />} />
          <Route path="/documents" element={<Documents />} />
          <Route
            path="/contractors"
            element={<Stub title="Контрагенты" planned="Справочник контрагентов с автозаполнением по ИНН (ЕГРЮЛ/ЕГРИП)." />}
          />
          <Route
            path="/goods"
            element={<Stub title="Товары" planned="Номенклатура товаров и услуг, остатки." />}
          />
          <Route path="/employees" element={<Employees />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
