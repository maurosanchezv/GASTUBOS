// gastubos/frontend/src/App.jsx

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore.js'

// Layout
import Layout from './components/Layout.jsx'

// Páginas
import LoginPage       from './pages/LoginPage.jsx'
import DashboardPage   from './pages/DashboardPage.jsx'
import TubosPage       from './pages/TubosPage.jsx'
import TuboDetallePage from './pages/TuboDetallePage.jsx'
import ClientesPage    from './pages/ClientesPage.jsx'
import EntregasPage    from './pages/EntregasPage.jsx'
import DevolucionesPage from './pages/DevolucionesPage.jsx'
import AlquileresPage  from './pages/AlquileresPage.jsx'
import VentasPage      from './pages/VentasPage.jsx'
import ReportesPage    from './pages/ReportesPage.jsx'
import AuditoriaPage   from './pages/AuditoriaPage.jsx'
import PerfilPage      from './pages/PerfilPage.jsx'
import UsuariosPage    from './pages/UsuariosPage.jsx'
import TarifasPage     from './pages/TarifasPage.jsx'
import CargasPage      from './pages/CargasPage.jsx'
import RepartoPage     from './pages/RepartoPage.jsx'
import TuboPublicoPage from './pages/TuboPublicoPage.jsx'  // sin auth

// Guard: redirige a /login si no hay token
function PrivateRoute({ children, roles }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.rol)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { token, fetchMe } = useAuthStore()

  useEffect(() => {
    if (token) fetchMe()
  }, [token])

  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Routes>
        {/* Pública: página de tubo al escanear QR */}
        <Route path="/tubos/:id" element={<TuboPublicoPage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* App principal */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="tubos" element={<TubosPage />} />
          <Route path="tubos/:id/detalle" element={<TuboDetallePage />} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="entregas" element={<EntregasPage />} />
          <Route path="cargas" element={<CargasPage />} />
          <Route path="devoluciones" element={<DevolucionesPage />} />
          <Route path="alquileres" element={<AlquileresPage />} />
          <Route path="ventas" element={<VentasPage />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="auditoria" element={<AuditoriaPage />} />
          <Route path="tarifas" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR']}><TarifasPage /></PrivateRoute>
          } />
          <Route path="reparto" element={<RepartoPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="usuarios" element={
            <PrivateRoute roles={['ADMIN']}><UsuariosPage /></PrivateRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
