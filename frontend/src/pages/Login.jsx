import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../api/axios'

export default function Login() {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth, token } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (token) navigate('/')
  }, [token])

  async function handleLogin(e) {
    e.preventDefault()
    if (!code.trim()) return setError('Enter your Employee ID')
    if (!password.trim()) return setError('Enter your password')
    setLoading(true); setError('')
    try {
      const r = await api.post('/api/auth/login', {
        employee_code: code.trim().toUpperCase(),
        password
      }, { timeout: 30000 })
      const user = {
        id: r.data.employee_id,
        employee_code: r.data.employee_code,
        name: r.data.name,
        role: r.data.role,
        designation: r.data.designation
      }
      setAuth(user, r.data.access_token)
      navigate(user.role === 'admin' ? '/' : user.role === 'deskwork' ? '/deskwork' : '/employee')
    } catch (err) {
      if (err.response?.status === 401) {
        // Genuine bad credentials — the only case this message should ever show.
        setError(err.response.data?.detail || 'Invalid Employee ID or password')
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Server is taking a while to respond (it may be waking up) — please try again.')
      } else if (!err.response) {
        setError('Could not reach the server. Check your connection and try again.')
      } else {
        setError('Something went wrong on our end — please try again in a few seconds.')
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '36px 32px', width: 'min(360px, 92vw)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>💧</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent2)', marginBottom: 4 }}>SHC Dashboard</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Water Purifier Management System<br />Sri Hamsini &amp; Chandra Enterprises
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,.1)', border: '1px solid var(--red)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 16,
            fontSize: 13, color: 'var(--red)'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          {/* Employee ID */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Employee ID
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🪪</span>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Employee ID"
                autoComplete="username"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '11px 12px 11px 38px',
                  color: 'var(--text)', fontSize: 14, outline: 'none',
                  letterSpacing: 1, fontWeight: 600
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔒</span>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '11px 40px 11px 38px',
                  color: 'var(--text)', fontSize: 14, outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4
                }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
            disabled={loading}
          >
            {loading ? '⏳ Logging in…' : '🔑 Login'}
          </button>
        </form>

      </div>
    </div>
  )
}
