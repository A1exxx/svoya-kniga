import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Taxes } from './pages/Taxes'
import { Settings } from './pages/Settings'
import { Stub } from './pages/Stub'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/settings" element={<Settings />} />
          <Route
            path="/money"
            element={<Stub title="Деньги" planned="Учёт поступлений и списаний, загрузка банковской выписки, операции с кассой." />}
          />
          <Route
            path="/documents"
            element={<Stub title="Документы" planned="Счета, акты, накладные, счета-фактуры, УПД, шаблоны." />}
          />
          <Route
            path="/contractors"
            element={<Stub title="Контрагенты" planned="Справочник контрагентов с автозаполнением по ИНН (ЕГРЮЛ/ЕГРИП)." />}
          />
          <Route
            path="/goods"
            element={<Stub title="Товары" planned="Номенклатура товаров и услуг, остатки." />}
          />
          <Route
            path="/employees"
            element={<Stub title="Сотрудники" planned="Зарплата, НДФЛ, страховые взносы и отчётность за сотрудников." />}
          />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
