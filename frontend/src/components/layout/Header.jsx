import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useNavigate, useLocation } from 'react-router-dom'
import ChangePasswordModal from '../ChangePasswordModal'
import api from '../../api/axios'
import { formatISTDateTime } from '../../utils/istTime'

const TITLES = {
  '/': 'Dashboard', '/employees': 'Employees', '/clients': 'Clients',
  '/schools': 'Schools / Sites', '/visits': 'Visits & Complaints',
  '/complaints': 'Complaints', '/stock': 'Stock & Materials',
  '/billing': 'Billing & Payments', '/salary': 'Salary',
  '/attendance': 'Attendance', '/tasks': 'Tasks', '/travel': 'Travel Allowance',
  '/proof-review': 'Proof Review'
}

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuthStore()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'SHC Dashboard'
  const [showChangePw, setShowChangePw] = useState(false)
  const [unread, setUnread] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [pulse, setPulse] = useState(false)
  const panelRef = useRef(null)
  const prevUnread = useRef(0)

  function handleLogout() { logout(); navigate('/login') }

  function loadUnread() {
    api.get('/api/notifications/unread-count').then(r => {
      const count = r.data.count || 0
      if (count > prevUnread.current) {
        setPulse(true)
        setTimeout(() => setPulse(false), 1500)
      }
      prevUnread.current = count
      setUnread(count)
    }).catch(() => {})
  }
  function loadNotifs() {
    api.get('/api/notifications/').then(r => setNotifs(r.data || [])).catch(() => {})
  }

  useEffect(() => {
    loadUnread()
    const id = setInterval(() => {
      if (!document.hidden) loadUnread()
    }, 10000)
    const onVisible = () => { if (!document.hidden) loadUnread() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  useEffect(() => {
    if (!showNotifs) return
    loadNotifs()
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowNotifs(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotifs])

  async function markAllRead() {
    await api.patch('/api/notifications/mark-all-read').catch(() => {})
    loadNotifs(); loadUnread()
  }
  async function markRead(id) {
    await api.patch(`/api/notifications/${id}/read`).catch(() => {})
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  return (
    <>
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0, gap: 8
      }}>
        {/* Left: hamburger + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="hamburger-btn" onClick={onMenuClick}>☰</button>
          <h2 style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h2>
        </div>

        {/* Right: user info + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Date — hidden on mobile */}
          <span className="hide-mobile" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>

          {user && (
            <span style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              👤 {user.name}
              <span className="hide-mobile" style={{ marginLeft: 4, color: 'var(--muted)', fontWeight: 400 }}>
                {user.employee_code ? `[${user.employee_code}]` : ''}
              </span>
            </span>
          )}

          {/* Notification Bell */}
          <style>{`
            @keyframes bell-pulse {
              0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
              50%  { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
            }
          `}</style>
          <div style={{ position: 'relative' }} ref={panelRef}>
            <button onClick={() => setShowNotifs(v => !v)} style={{
              background: showNotifs ? 'rgba(56,189,248,.15)' : 'var(--surface2)',
              border: `1px solid ${showNotifs ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16,
              position: 'relative', lineHeight: 1
            }}>
              🔔
              {unread > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'var(--red)', color: '#fff', borderRadius: '50%',
                  fontSize: 9, fontWeight: 800, width: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{unread > 9 ? '9+' : unread}</span>
              )}
            </button>

            {showNotifs && (
              <div style={{
                position: 'fixed', right: 12, top: 56,
                width: 'min(320px, calc(100vw - 24px))', maxHeight: 400,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,.35)', zIndex: 500, overflow: 'hidden',
                display: 'flex', flexDirection: 'column'
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>🔔 Notifications</span>
                  {unread > 0 && (
                    <button onClick={markAllRead} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {notifs.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No notifications</div>
                  ) : notifs.map(n => (
                    <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: n.is_read ? 'transparent' : 'rgba(56,189,248,.06)',
                      cursor: n.is_read ? 'default' : 'pointer'
                    }}>
                      <div style={{ fontSize: 12, fontWeight: n.is_read ? 400 : 600 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                        {formatISTDateTime(n.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {!n.is_read && <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700 }}>● new</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'} style={{
            background: 'var(--surface2)', border: '1px solid var(--btn-outline-border)',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 15, lineHeight: 1,
            color: 'var(--btn-outline-text)'
          }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button className="btn btn-outline btn-sm hide-mobile" onClick={() => setShowChangePw(true)}>🔑 Password</button>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </>
  )
}
