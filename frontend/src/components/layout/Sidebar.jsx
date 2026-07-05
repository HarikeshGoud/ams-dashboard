import { NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'

const TOP_NAV = [
  { to: '/',           icon: '📊', label: 'Dashboard'       },
  { to: '/employees',  icon: '👷', label: 'Employees'       },
]

const UNITS = [
  { to: '/unit/1', label: 'Unit 1 — Telangana',      dot: '#2563eb' },
  { to: '/unit/2', label: 'Unit 2 — Andhra Pradesh', dot: '#7c3aed' },
  { to: '/unit/3', label: 'Unit 3 — Other States',   dot: '#0891b2' },
]

const BOTTOM_NAV = [
  { to: '/schools',    icon: '🏫', label: 'Schools / Sites' },
  { to: '/visits',     icon: '📋', label: 'Visits'          },
  { to: '/amc-reports', icon: '📋', label: 'AMC Reports'    },
  { to: '/reports',    icon: '📊', label: 'Reports'         },
  { to: '/stock',      icon: '📦', label: 'Stock'           },
  { to: '/billing',    icon: '💰', label: 'Billing'         },
  { to: '/salary',     icon: '🧾', label: 'Salary'          },
  { to: '/attendance', icon: '🗓️', label: 'Attendance'      },
  { to: '/tasks',      icon: '✅', label: 'Tasks'           },
  { to: '/travel',     icon: '🚗', label: 'Travel'          },
  { to: '/proof-review',    icon: '🔍', label: 'Proof Review'    },
  { to: '/service-reports', icon: '📄', label: 'Service Reports' },
]

const linkStyle = ({ isActive }) => ({
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
  cursor: 'pointer', borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
  color: isActive ? 'var(--accent)' : 'var(--muted)',
  fontWeight: isActive ? 600 : 400, fontSize: 13, textDecoration: 'none',
  background: isActive ? 'rgba(59,158,255,0.1)' : 'transparent',
  transition: 'all .15s', letterSpacing: '-0.01em'
})

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const isClientsActive = location.pathname === '/clients' || location.pathname.startsWith('/unit/')
  const [clientsOpen, setClientsOpen] = useState(isClientsActive)

  return (
    <>
      <div className={`sidebar-overlay${open ? ' open' : ''}`} onClick={onClose} />

      <div className={`sidebar${open ? ' open' : ''}`}>
        <div style={{ padding: '16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent2)' }}>💧 AMS Dashboard</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Water Purifier Management</div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--surface2)', border: 'none', color: 'var(--muted)',
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 16, lineHeight: 1
          }}>✕</button>
        </div>

        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {/* Top nav */}
          {TOP_NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} style={linkStyle} onClick={onClose}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}

          {/* Clients collapsible group */}
          <div>
            {/* Clients header row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <NavLink to="/clients" end style={linkStyle} onClick={onClose} style={({ isActive }) => ({
                flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px',
                cursor: 'pointer', borderLeft: `3px solid ${isActive || isClientsActive ? 'var(--accent)' : 'transparent'}`,
                color: isActive || isClientsActive ? 'var(--accent)' : 'var(--muted)',
                fontWeight: isActive || isClientsActive ? 600 : 400, fontSize: 13, textDecoration: 'none',
                background: isActive || isClientsActive ? 'rgba(59,158,255,0.1)' : 'transparent',
                transition: 'all .15s',
              })}>
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>🏢</span>
                Clients
              </NavLink>
              <button
                onClick={() => setClientsOpen(o => !o)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '10px 14px 10px 4px', fontSize: 12 }}
              >
                {clientsOpen ? '▼' : '▶'}
              </button>
            </div>

            {/* Unit sub-items */}
            {clientsOpen && (
              <div style={{ background: 'var(--surface2)', borderLeft: '2px solid var(--border)', marginLeft: 16 }}>
                {UNITS.map(u => (
                  <NavLink key={u.to} to={u.to} style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                    textDecoration: 'none', fontSize: 12, cursor: 'pointer',
                    color: isActive ? 'var(--accent)' : 'var(--muted)',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'rgba(59,158,255,0.08)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    transition: 'all .12s',
                  })} onClick={onClose}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.dot, flexShrink: 0 }} />
                    {u.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Bottom nav */}
          {BOTTOM_NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={linkStyle} onClick={onClose}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
          Telangana Water Dept.<br />18 Mandals · 843 Schools
        </div>
      </div>
    </>
  )
}
