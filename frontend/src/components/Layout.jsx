// gastubos/frontend/src/components/Layout.jsx
import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

const GAS_COLORS = {
  'CO2':       '#1A5FA8', 'CO₂':      '#1A5FA8',
  'Oxígeno':   '#00695C', 'Argón':    '#5B21B6',
  'Nitrógeno': '#52525B', 'Acetileno':'#B45309',
}
export const gasColor = (g) => {
  for (const k in GAS_COLORS) if (g?.includes(k)) return GAS_COLORS[k]
  return '#9A3412'
}

const NAV = [
  { group: null,         items: [
    { to: '/',           icon: 'ti-layout-dashboard', label: 'Dashboard' },
  ]},
  { group: 'Operaciones', items: [
    { to: '/tubos',      icon: 'ti-cylinder',         label: 'Tubos' },
    { to: '/entregas',   icon: 'ti-truck-delivery',   label: 'Entregas' },
    { to: '/cargas',     icon: 'ti-gas-station',      label: 'Cargas' },
    { to: '/devoluciones',icon: 'ti-arrow-back-up',   label: 'Devoluciones' },
    { to: '/alquileres', icon: 'ti-calendar-time',    label: 'Alquileres', badge: true },
  ]},
  { group: 'Gestión', items: [
    { to: '/clientes',   icon: 'ti-users',            label: 'Clientes' },
    { to: '/ventas',     icon: 'ti-shopping-cart',    label: 'Ventas' },
  ]},
  { group: 'Sistema', items: [
    { to: '/reportes',   icon: 'ti-chart-bar',        label: 'Reportes', restrictedTo: ['ADMIN', 'SUPERVISOR'] },
    { to: '/auditoria',  icon: 'ti-list-details',     label: 'Auditoría', restrictedTo: ['ADMIN', 'SUPERVISOR'] },
    { to: '/usuarios',   icon: 'ti-shield-lock',      label: 'Usuarios', restrictedTo: ['ADMIN'] },
  ]},
  { group: 'Mi Cuenta', items: [
    { to: '/perfil',     icon: 'ti-user-circle',      label: 'Mi Perfil' },
  ]},
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [vencidos, setVencidos] = useState(0)

  useEffect(() => {
    import('../services/api.js').then(({ default: api }) =>
      api.get('/alquileres/vencidos').then(r => setVencidos(r.data.length)).catch(() => {})
    )
  }, [])

  const initials = user?.nombre?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <nav className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark"><i className="ti ti-cylinder" /></div>
          <div>
            <div className="logo-text">GasTubos</div>
            <div className="logo-sub">Gestión Industrial v1.0</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {NAV.map((section, i) => {
            const visibleItems = section.items.filter(item => 
              !item.restrictedTo || item.restrictedTo.includes(user?.rol)
            )
            if (visibleItems.length === 0) return null

            return (
              <div className="nav-section" key={i}>
                {section.group && <div className="nav-group-label">{section.group}</div>}
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className={`ti ${item.icon} nav-icon`} aria-hidden />
                    {item.label}
                    {item.badge && vencidos > 0 && (
                      <span className="nav-badge">{vencidos}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </div>

        <div className="sidebar-footer">
          <div className="user-chip" onClick={() => navigate('/perfil')} style={{ cursor: 'pointer' }}>
            <div className="user-avatar" style={{ overflow: 'hidden' }}>
              {user?.avatar ? <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.nombre}</div>
              <div className="user-role">{user?.rol}</div>
            </div>
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); logout(); navigate('/login') }} title="Salir">
              <i className="ti ti-logout" />
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div className="app-main">
        <Outlet />
      </div>

      {/* BOTTOM NAV (Mobile Only) */}
      <div className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <i className="ti ti-layout-dashboard" />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/tubos" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <i className="ti ti-cylinder" />
          <span>Tubos</span>
        </NavLink>
        <NavLink to="/entregas" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <i className="ti ti-truck-delivery" />
          <span>Entregas</span>
        </NavLink>
        <NavLink to="/clientes" className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
          <i className="ti ti-users" />
          <span>Clientes</span>
        </NavLink>
        <button className="bottom-nav-link" style={{ border: 'none', background: 'none' }} onClick={() => setSidebarOpen(true)}>
          <i className="ti ti-menu-2" />
          <span>Más</span>
        </button>
      </div>
    </div>
  )
}
