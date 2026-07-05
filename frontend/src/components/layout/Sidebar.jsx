import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',              icon: '📊', label: 'Dashboard'       },
  { to: '/employees',     icon: '👷', label: 'Employees'       },
  { to: '/clients',       icon: '🏢', label: 'Clients'         },
  { to: '/unit/1',        icon: '🔵', label: 'Unit 1 — Telangana'      },
  { to: '/unit/2',        icon: '🟣', label: 'Unit 2 — Andhra Pradesh' },
  { to: '/unit/3',        icon: '🔷', label: 'Unit 3 — Other States'   },
  { to: '/schools',       icon: '🏫', label: 'Schools / Sites' },
  { to: '/visits',        icon: '📋', label: 'Visits'          },
  { to: '/amc-reports',   icon: '📋', label: 'AMC Reports'     },
  { to: '/reports',       icon: '📊', label: 'Reports'         },
  { to: '/stock',         icon: '📦', label: 'Stock'           },
  { to: '/billing',       icon: '💰', label: 'Billing'         },
  { to: '/salary',        icon: '🧾', label: 'Salary'          },
  { to: '/attendance',    icon: '🗓️', label: 'Attendance'      },
  { to: '/tasks',         icon: '✅', label: 'Tasks'           },
  { to: '/travel',        icon: '🚗', label: 'Travel'          },
  { to: '/proof-review',  icon: '🔍', label: 'Proof Review'    },
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
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} style={linkStyle} onClick={onClose}>
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
