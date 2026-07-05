import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import ChangePasswordModal from '../ChangePasswordModal'

const NAV = [
  { path: '/deskwork',            icon: '🏠', label: 'Home'       },
  { path: '/deskwork/tasks',      icon: '📋', label: 'Tasks'      },
  { path: '/deskwork/attendance', icon: '📅', label: 'Attendance' },
  { path: '/deskwork/stock',      icon: '📦', label: 'Stock'      },
  { path: '/deskwork/travel',          icon: '🚗', label: 'Travel'          },
  { path: '/deskwork/service-reports', icon: '📄', label: 'Service Reports' },
  { path: '/deskwork/schools',         icon: '🏫', label: 'Schools'         },
  { path: '/deskwork/clients',         icon: '🏢', label: 'Clients'         },
]

const UNITS = [
  { path: '/deskwork/unit/1', icon: '🔵', label: 'Unit 1 — Telangana'      },
  { path: '/deskwork/unit/2', icon: '🟣', label: 'Unit 2 — Andhra Pradesh' },
  { path: '/deskwork/unit/3', icon: '🔷', label: 'Unit 3 — Other States'   },
]

export default function DeskworkLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)
  const activePath = location.pathname.replace(/\/$/, '') || '/deskwork'
  const [clientsOpen, setClientsOpen] = useState(false)
  const clientsRef = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (clientsRef.current && !clientsRef.current.contains(e.target)) setClientsOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 70 }}>
      {/* Top bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>💧</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)' }}>AMS Dashboard</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Deskwork — {user?.designation || 'Office Staff'}</div>
          </div>
        </div>

        {/* Desktop nav links */}
        <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}
          className="deskwork-topnav">
          {NAV.map(n => {
            // Clients button gets a dropdown for units
            if (n.path === '/deskwork/clients') {
              const isActive = activePath.startsWith('/deskwork/clients') || activePath.startsWith('/deskwork/unit/')
              return (
                <div key={n.path} ref={clientsRef} style={{ position: 'relative' }}>
                  <button onClick={() => setClientsOpen(o => !o)} style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: isActive ? 700 : 400,
                    cursor: 'pointer', background: isActive ? 'rgba(56,189,248,.15)' : 'none',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    color: isActive ? 'var(--accent)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5
                  }}>
                    {n.icon} {n.label} <span style={{ fontSize: 10 }}>▼</span>
                  </button>
                  {clientsOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, zIndex: 200, minWidth: 200,
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,.4)', padding: '6px 0', marginTop: 4
                    }}>
                      <button onClick={() => { navigate('/deskwork/clients'); setClientsOpen(false) }} style={{
                        width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none',
                        border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontWeight: 600
                      }}>🏢 All Clients</button>
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      {UNITS.map(u => (
                        <button key={u.path} onClick={() => { navigate(u.path); setClientsOpen(false) }} style={{
                          width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none',
                          border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer'
                        }}>
                          <span style={{ marginRight: 6 }}>{u.icon}</span>{u.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            const isActive = n.path === '/deskwork' ? activePath === '/deskwork' : activePath.startsWith(n.path)
            return (
              <button key={n.path} onClick={() => navigate(n.path)} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: isActive ? 700 : 400,
                cursor: 'pointer', background: isActive ? 'rgba(56,189,248,.15)' : 'none',
                border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                color: isActive ? 'var(--accent)' : 'var(--muted)'
              }}>
                {n.icon} {n.label}
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            🖥️ {user?.name}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setShowChangePw(true)}>🔑</button>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
        <Outlet />
      </div>

      {/* Bottom nav — mobile only */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', padding: '4px 0'
      }} className="deskwork-bottomnav">
        {NAV.map(n => {
          const isActive = n.path === '/deskwork' ? activePath === '/deskwork' : activePath.startsWith(n.path)
          return (
            <button key={n.path} onClick={() => navigate(n.path)} style={{
              flex: 1, padding: '6px 4px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer',
              borderTop: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              color: isActive ? 'var(--accent)' : 'var(--muted)'
            }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400 }}>{n.label}</span>
            </button>
          )
        })}
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  )
}
