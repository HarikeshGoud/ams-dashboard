import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import ChangePasswordModal from '../ChangePasswordModal'

const NAV = [
  { path: '/deskwork',            icon: '🏠', label: 'Dashboard' },
  { path: '/deskwork/tasks',      icon: '📋', label: 'Tasks'     },
  { path: '/deskwork/attendance', icon: '📅', label: 'Attendance'},
  { path: '/deskwork/stock',      icon: '📦', label: 'Stock'     },
  { path: '/deskwork/travel',     icon: '🚗', label: 'Travel'    },
]

export default function DeskworkLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)

  function handleLogout() { logout(); navigate('/login') }
  const activePath = location.pathname.replace(/\/$/, '') || '/deskwork'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>💧</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent2)' }}>AMS Dashboard</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              Deskwork — {user?.designation || 'Office Staff'}
            </div>
          </div>
        </div>

        {/* Nav links (horizontal for desktop) */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {NAV.map(n => {
            const isActive = n.path === '/deskwork' ? activePath === '/deskwork' : activePath.startsWith(n.path)
            return (
              <button key={n.path} onClick={() => navigate(n.path)} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: isActive ? 700 : 400,
                cursor: 'pointer', background: isActive ? 'rgba(56,189,248,.15)' : 'none',
                border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                color: isActive ? 'var(--accent)' : 'var(--muted)'
              }}>
                {n.icon} {n.label}
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            🖥️ {user?.name}
            {user?.employee_code && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--muted)' }}>[{user.employee_code}]</span>}
          </div>
          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => setShowChangePw(true)}>🔑</button>
          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px' }}>
        <Outlet />
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  )
}
