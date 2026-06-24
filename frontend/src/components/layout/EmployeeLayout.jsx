import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import ChangePasswordModal from '../ChangePasswordModal'

const NAV = [
  { path: '/employee',          icon: '🏠', label: 'Home'       },
  { path: '/employee/tasks',    icon: '✅', label: 'Tasks'      },
  { path: '/employee/visits',   icon: '🏫', label: 'Visits'     },
  { path: '/employee/travel',   icon: '🚗', label: 'Travel'     },
  { path: '/employee/billing',  icon: '🧾', label: 'Work Bills' },
  { path: '/employee/salary',   icon: '💰', label: 'Salary'     },
  { path: '/employee/attendance', icon: '📅', label: 'Attendance' },
]

export default function EmployeeLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)

  function handleLogout() { logout(); navigate('/login') }

  const activePath = location.pathname.replace(/\/$/, '') || '/employee'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 70 }}>
      {/* Top bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>💧</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)' }}>AMS Dashboard</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Field Technician</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              👤 {user?.name}
              {user?.employee_code && (
                <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>
                  [{user.employee_code}]
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
          <button className="btn btn-outline" style={{ fontSize: 10, padding: '4px 8px' }}
            onClick={() => setShowChangePw(true)}>🔑</button>
          <button className="btn btn-outline" style={{ fontSize: 10, padding: '4px 8px' }} onClick={handleLogout}>
            Exit
          </button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 14px' }}>
        <Outlet />
      </div>

      {/* Bottom navigation */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', overflowX: 'auto', padding: '4px 0'
      }}>
        {NAV.map(n => {
          const isActive = n.path === '/employee'
            ? activePath === '/employee'
            : activePath.startsWith(n.path)
          return (
            <button key={n.path} onClick={() => navigate(n.path)} style={{
              flex: '0 0 auto', minWidth: 60, padding: '6px 8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer',
              borderTop: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              color: isActive ? 'var(--accent)' : 'var(--muted)'
            }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap' }}>{n.label}</span>
            </button>
          )
        })}
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  )
}
