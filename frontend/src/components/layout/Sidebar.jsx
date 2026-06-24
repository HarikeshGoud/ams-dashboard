import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',           icon: '📊', label: 'Dashboard'       },
  { to: '/employees',  icon: '👷', label: 'Employees'       },
  { to: '/clients',    icon: '🏢', label: 'Clients'         },
  { to: '/schools',    icon: '🏫', label: 'Schools / Sites' },
  { to: '/visits',     icon: '📋', label: 'Visits'          },
  { to: '/complaints', icon: '🔴', label: 'Complaints'      },
  { to: '/stock',      icon: '📦', label: 'Stock'           },
  { to: '/billing',    icon: '💰', label: 'Billing'         },
  { to: '/salary',     icon: '🧾', label: 'Salary'          },
  { to: '/attendance', icon: '🗓️', label: 'Attendance'      },
  { to: '/tasks',      icon: '✅', label: 'Tasks'           },
  { to: '/travel',       icon: '🚗', label: 'Travel'         },
  { to: '/proof-review', icon: '🔍', label: 'Proof Review'   },
]

const linkStyle = ({ isActive }) => ({
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
  cursor: 'pointer', borderLeft: `3px solid ${isActive ? 'var(--accent2)' : 'transparent'}`,
  color: isActive ? 'var(--accent2)' : 'var(--muted)',
  fontWeight: isActive ? 600 : 400, fontSize: 13, textDecoration: 'none',
  background: isActive ? 'var(--surface2)' : 'transparent',
  transition: 'all .15s'
})

export default function Sidebar() {
  return (
    <div style={{
      width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto'
    }}>
      <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent2)' }}>💧 AMS Dashboard</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Water Purifier Management</div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} style={linkStyle}>
            <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
        Telangana Water Dept.<br />18 Mandals · 843 Schools
      </div>
    </div>
  )
}
