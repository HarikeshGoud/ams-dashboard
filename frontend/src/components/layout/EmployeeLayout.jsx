import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import ChangePasswordModal from '../ChangePasswordModal'
import api from '../../api/axios'

const PING_INTERVAL_MS = 25000
const WORK_START_MIN = 9 * 60        // 9:00 AM
const WORK_END_MIN   = 18 * 60 + 30  // 6:30 PM

function withinWorkHours() {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= WORK_START_MIN && mins <= WORK_END_MIN
}

const NAV = [
  { path: '/employee',          icon: '🏠', label: 'Home'       },
  { path: '/employee/tasks',    icon: '✅', label: 'Tasks'      },
  { path: '/employee/visits',   icon: '🏫', label: 'Visits'     },
  { path: '/employee/travel',   icon: '🚗', label: 'Travel'     },
  { path: '/employee/purchases', icon: '🛒', label: 'Purchased Stock' },
  { path: '/employee/salary',   icon: '💰', label: 'Salary'     },
  { path: '/employee/attendance', icon: '📅', label: 'Attendance' },
  { path: '/employee/my-stock',  icon: '🎒', label: 'My Stock'   },
]

export default function EmployeeLayout() {
  const { user, logout } = useAuthStore()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isStandalone] = useState(() =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  )

  useEffect(() => {
    function onBeforeInstall(e) { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  function handleLogout() { logout(); navigate('/login') }

  const activePath = location.pathname.replace(/\/$/, '') || '/employee'

  // Live location ping — sends this technician's GPS to the server every 25s,
  // restricted to 9:00 AM-6:30 PM, while the employee app is open in the foreground
  // (used for admin/deskwork tracking). Stops the moment the tab/app is closed or
  // suspended — browsers don't allow geolocation access in the background.
  const pingingRef = useRef(false)
  const wakeLockRef = useRef(null)
  useEffect(() => {
    if (user?.role !== 'technician') return

    function sendPing() {
      if (!withinWorkHours() || pingingRef.current || !navigator.geolocation) return
      pingingRef.current = true
      navigator.geolocation.getCurrentPosition(
        pos => {
          api.post('/api/locations/ping', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }).catch(() => {}).finally(() => { pingingRef.current = false })
        },
        () => { pingingRef.current = false },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 20000 }
      )
    }

    async function acquireWakeLock() {
      try { wakeLockRef.current = await navigator.wakeLock?.request('screen') } catch {}
    }
    acquireWakeLock()

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    sendPing()
    const id = setInterval(sendPing, PING_INTERVAL_MS)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      wakeLockRef.current?.release?.().catch(() => {})
    }
  }, [user?.role])

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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)' }}>SHC Dashboard</div>
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
          <button onClick={toggleTheme} style={{
            background: 'var(--surface2)', border: '1px solid var(--btn-outline-border)',
            borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13, lineHeight: 1
          }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="btn btn-outline" style={{ fontSize: 10, padding: '4px 8px' }}
            onClick={() => setShowChangePw(true)}>🔑</button>
          <button className="btn btn-outline" style={{ fontSize: 10, padding: '4px 8px' }} onClick={handleLogout}>
            Exit
          </button>
        </div>
      </div>

      {/* Live tracking banner */}
      {user?.role === 'technician' && (
        <div style={{
          background: withinWorkHours() ? 'rgba(52,211,153,.1)' : 'rgba(100,116,139,.1)',
          borderBottom: `1px solid ${withinWorkHours() ? 'var(--green)' : 'var(--border)'}`,
          padding: '6px 14px', fontSize: 11, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'
        }}>
          <span style={{ color: withinWorkHours() ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
            {withinWorkHours()
              ? '📍 Live tracking active till 6:30 PM — keep this app open on your phone'
              : '📍 Live tracking resumes at 9:00 AM'}
          </span>
          {!isStandalone && installPrompt && (
            <button onClick={handleInstall} style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
              background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer'
            }}>
              ⬇ Install App
            </button>
          )}
        </div>
      )}

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
