import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Taxes } from './pages/Taxes'
import { Settings } from './pages/Settings'
import { Requisites } from './pages/Requisites'
import { Employees } from './pages/Employees'
import { Money } from './pages/Money'
import { Documents } from './pages/Documents'
import { Contractors } from './pages/Contractors'
import { Goods } from './pages/Goods'
import { Reports } from './pages/Reports'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/requisites" element={<Requisites />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/money" element={<Money />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/goods" element={<Goods />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
