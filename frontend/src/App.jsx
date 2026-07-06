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
import RemisionPage    from './pages/RemisionPage.jsx'
import CamionesPage    from './pages/CamionesPage.jsx'
import TuboPublicoPage from './pages/TuboPublicoPage.jsx'  // sin auth

// El REPARTIDOR no debe ver el Dashboard administrativo; lo desviamos
// directo a su hoja de ruta. El resto de los roles entra al Dashboard.
function HomeRedirect() {
  const { user } = useAuthStore()
  if (user?.rol === 'REPARTIDOR') return <Navigate to="/reparto" replace />
  return <DashboardPage />
}

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
          <Route index element={<HomeRedirect />} />
          <Route path="tubos" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><TubosPage /></PrivateRoute>
          } />
          <Route path="tubos/:id/detalle" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><TuboDetallePage /></PrivateRoute>
          } />
          <Route path="clientes" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><ClientesPage /></PrivateRoute>
          } />
          <Route path="entregas" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><EntregasPage /></PrivateRoute>
          } />
          <Route path="cargas" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><CargasPage /></PrivateRoute>
          } />
          <Route path="devoluciones" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><DevolucionesPage /></PrivateRoute>
          } />
          <Route path="alquileres" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><AlquileresPage /></PrivateRoute>
          } />
          <Route path="ventas" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><VentasPage /></PrivateRoute>
          } />
          <Route path="reportes" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR']}><ReportesPage /></PrivateRoute>
          } />
          <Route path="auditoria" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR']}><AuditoriaPage /></PrivateRoute>
          } />
          <Route path="tarifas" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR']}><TarifasPage /></PrivateRoute>
          } />
          <Route path="camiones" element={
            <PrivateRoute roles={['ADMIN', 'SUPERVISOR', 'OPERADOR']}><CamionesPage /></PrivateRoute>
          } />
          <Route path="reparto" element={<RepartoPage />} />
          <Route path="remision/:numero" element={<RemisionPage />} />
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
