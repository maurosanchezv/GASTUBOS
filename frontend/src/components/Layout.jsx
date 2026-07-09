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

// Roles "de oficina": ven todo lo operativo y de gestión. El REPARTIDOR solo ve
// Dashboard, Hoja de Ruta y Mi Perfil — el resto se le esconde via `restrictedTo`.
const OFICINA = ['ADMIN', 'SUPERVISOR', 'OPERADOR']

const NAV = [
  { group: null,         items: [
    { to: '/',           icon: 'ti-layout-dashboard', label: 'Dashboard' },
  ]},
  { group: 'Operaciones', items: [
    { to: '/tubos',      icon: 'ti-cylinder',         label: 'Tubos',        restrictedTo: OFICINA },
    { to: '/cilindros-terceros', icon: 'ti-package',  label: 'Cilindros de Terceros', restrictedTo: OFICINA },
    { to: '/camiones',   icon: 'ti-truck',            label: 'Camiones',     restrictedTo: OFICINA },
    { to: '/reparto',    icon: 'ti-route',            label: 'Hoja de Ruta' },
    { to: '/entregas',   icon: 'ti-truck-delivery',   label: 'Entregas',     restrictedTo: OFICINA },
    { to: '/cargas',     icon: 'ti-gas-station',      label: 'Cargas',       restrictedTo: OFICINA },
    { to: '/devoluciones',icon: 'ti-arrow-back-up',   label: 'Devoluciones', restrictedTo: ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'] },
    { to: '/alquileres', icon: 'ti-calendar-time',    label: 'Alquileres',   restrictedTo: OFICINA, badge: true },
  ]},
  { group: 'Gestión', items: [
    { to: '/clientes',   icon: 'ti-users',            label: 'Clientes', restrictedTo: OFICINA },
    { to: '/ventas',     icon: 'ti-shopping-cart',    label: 'Ventas',   restrictedTo: OFICINA },
  ]},
  { group: 'Sistema', items: [
    { to: '/tarifas',    icon: 'ti-coin',             label: 'Tarifas', restrictedTo: ['ADMIN', 'SUPERVISOR'] },
    { to: '/reportes',   icon: 'ti-chart-bar',        label: 'Reportes', restrictedTo: ['ADMIN', 'SUPERVISOR'] },
    { to: '/auditoria',  icon: 'ti-list-details',     label: 'Auditoría', restrictedTo: ['ADMIN', 'SUPERVISOR'] },
    { to: '/usuarios',   icon: 'ti-shield-lock',      label: 'Usuarios', restrictedTo: ['ADMIN'] },
    { to: '/configuracion',icon: 'ti-settings',         label: 'Configuración', restrictedTo: ['ADMIN'] },
  ]},
  { group: 'Mi Cuenta', items: [
    { to: '/perfil',     icon: 'ti-user-circle',      label: 'Mi Perfil' },
  ]},
]

// Items del bottom-nav móvil. El REPARTIDOR ve un layout simplificado.
const BOTTOM_NAV = [
  { to: '/',         icon: 'ti-layout-dashboard',  label: 'Inicio',   restrictedTo: OFICINA },
  { to: '/tubos',    icon: 'ti-cylinder',          label: 'Tubos',    restrictedTo: OFICINA },
  { to: '/reparto',  icon: 'ti-route',             label: 'Ruta',     restrictedTo: ['REPARTIDOR'] },
  { to: '/entregas', icon: 'ti-truck-delivery',    label: 'Entregas', restrictedTo: OFICINA },
  { to: '/clientes', icon: 'ti-users',             label: 'Clientes', restrictedTo: OFICINA },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [vencidos, setVencidos] = useState(0)

  useEffect(() => {
    // El REPARTIDOR no tiene acceso al endpoint de alquileres — evitar la llamada.
    if (user?.rol === 'REPARTIDOR') return
    import('../services/api.js').then(({ default: api }) =>
      api.get('/alquileres/vencidos').then(r => setVencidos(r.data.length)).catch(() => {})
    )
  }, [user?.rol])

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
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); logout(); navigate('/login') }} title="Salir" style={{ color: 'var(--red)', background: 'var(--red-light)', borderColor: 'rgba(185, 28, 28, 0.2)' }}>
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
        {BOTTOM_NAV.filter(b => !b.restrictedTo || b.restrictedTo.includes(user?.rol)).map(b => (
          <NavLink key={b.to} to={b.to} end={b.to === '/'} className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}>
            <i className={`ti ${b.icon}`} />
            <span>{b.label}</span>
          </NavLink>
        ))}
        <button className="bottom-nav-link" style={{ border: 'none', background: 'none' }} onClick={() => setSidebarOpen(true)}>
          <i className="ti ti-menu-2" />
          <span>Más</span>
        </button>
      </div>

      {/* LAUNCHER MÓVIL (Reemplaza al sidebar en pantallas pequeñas) */}
      <div className={`mobile-launcher ${sidebarOpen ? 'open' : ''}`}>
        <div className="mobile-launcher-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="logo-mark" style={{ width: 28, height: 28, fontSize: 14 }}><i className="ti ti-cylinder" /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Menú Principal</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{user?.nombre} · {user?.rol}</div>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: 20, 
              color: 'var(--text-secondary)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="mobile-launcher-body">
          {user?.rol === 'REPARTIDOR' ? (
            /* Layout simplificado para Repartidores (Choferes) */
            <div className="mobile-launcher-grid">
              <div 
                className="launcher-card launcher-card-full"
                style={{ borderLeft: '4px solid var(--blue)' }}
                onClick={() => { navigate('/reparto'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-blue" style={{ width: 44, height: 44, fontSize: 22 }}>
                  <i className="ti ti-route" />
                </div>
                <div>
                  <div className="launcher-card-title" style={{ fontSize: 14 }}>Hoja de Ruta</div>
                  <div className="launcher-card-desc" style={{ marginTop: 2 }}>Ver entregas asignadas para hoy</div>
                </div>
              </div>

              <div 
                className="launcher-card"
                style={{ borderLeft: '4px solid var(--coral)' }}
                onClick={() => { navigate('/devoluciones'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-coral">
                  <i className="ti ti-arrow-back-up" />
                </div>
                <div>
                  <div className="launcher-card-title">Devoluciones</div>
                  <div className="launcher-card-desc">Cilindros vacíos</div>
                </div>
              </div>

              <div 
                className="launcher-card"
                style={{ borderLeft: '4px solid var(--purple)' }}
                onClick={() => { navigate('/perfil'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-purple">
                  <i className="ti ti-user-circle" />
                </div>
                <div>
                  <div className="launcher-card-title">Mi Perfil</div>
                  <div className="launcher-card-desc">Ver datos de cuenta</div>
                </div>
              </div>

              <div 
                className="launcher-card launcher-card-full"
                style={{ borderLeft: '4px solid var(--red)', marginTop: 24 }}
                onClick={() => { logout(); navigate('/login'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-red">
                  <i className="ti ti-logout" />
                </div>
                <div>
                  <div className="launcher-card-title" style={{ color: 'var(--red)' }}>Cerrar Sesión</div>
                  <div className="launcher-card-desc">Salir de la aplicación</div>
                </div>
              </div>
            </div>
          ) : (
            /* Layout general para el personal de Oficina (Administradores/Operadores) */
            <div className="mobile-launcher-grid">
              <div 
                className="launcher-card launcher-card-full"
                style={{ borderLeft: '4px solid var(--blue)' }}
                onClick={() => { navigate('/'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-blue">
                  <i className="ti ti-layout-dashboard" />
                </div>
                <div>
                  <div className="launcher-card-title">Dashboard</div>
                  <div className="launcher-card-desc">Inicio del sistema</div>
                </div>
              </div>

              {NAV.flatMap(s => s.items)
                .filter(item => item.to !== '/' && (!item.restrictedTo || item.restrictedTo.includes(user?.rol)))
                .map(item => {
                  let borderCol = 'var(--border-mid)';
                  let iconClass = 'launcher-icon-gray';
                  if (item.to === '/reparto') { borderCol = 'var(--blue)'; iconClass = 'launcher-icon-blue'; }
                  else if (item.to === '/tubos' || item.to === '/cilindros-terceros') { borderCol = 'var(--blue)'; iconClass = 'launcher-icon-blue'; }
                  else if (item.to === '/entregas' || item.to === '/camiones') { borderCol = 'var(--teal)'; iconClass = 'launcher-icon-teal'; }
                  else if (item.to === '/cargas' || item.to === '/devoluciones') { borderCol = 'var(--coral)'; iconClass = 'launcher-icon-coral'; }
                  else if (item.to === '/alquileres' || item.to === '/ventas') { borderCol = 'var(--purple)'; iconClass = 'launcher-icon-purple'; }
                  else if (item.to === '/clientes') { borderCol = 'var(--amber)'; iconClass = 'launcher-icon-amber'; }
                  else if (item.to === '/reportes' || item.to === '/auditoria') { borderCol = 'var(--purple)'; iconClass = 'launcher-icon-purple'; }

                  return (
                    <div 
                      key={item.to}
                      className="launcher-card"
                      style={{ borderLeft: `4px solid ${borderCol}` }}
                      onClick={() => { navigate(item.to); setSidebarOpen(false); }}
                    >
                      <div className={`launcher-icon ${iconClass}`}>
                        <i className={`ti ${item.icon}`} />
                      </div>
                      <div>
                        <div className="launcher-card-title">{item.label}</div>
                      </div>
                    </div>
                  )
                })}

              <div 
                className="launcher-card launcher-card-full"
                style={{ borderLeft: '4px solid var(--red)', marginTop: 24 }}
                onClick={() => { logout(); navigate('/login'); setSidebarOpen(false); }}
              >
                <div className="launcher-icon launcher-icon-red">
                  <i className="ti ti-logout" />
                </div>
                <div>
                  <div className="launcher-card-title" style={{ color: 'var(--red)' }}>Cerrar Sesión</div>
                  <div className="launcher-card-desc">Salir de la aplicación</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
