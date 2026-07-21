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

  const inputWrap = { position: 'relative' }
  const iconStyle = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none', opacity: .85 }
  const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.6px' }

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      {/* Scoped animations + ambient aqua field for the login scene */}
      <style>{`
        @keyframes loginCardIn { from { opacity: 0; transform: translateY(22px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes dropBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes haloPulse { 0%,100% { opacity: .55; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
        @keyframes blobFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.12); } }
        @keyframes blobFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-36px,26px) scale(1.1); } }
        @keyframes fieldIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .login-field { animation: fieldIn .5s ease both; }
        .login-input {
          width: 100%; box-sizing: border-box;
          background: var(--surface2) !important; border: 1.5px solid var(--border) !important;
          border-radius: 12px;
          /* !important needed to beat the global input[...] reset, whose
             attribute selector out-specifies this single class and would
             otherwise pull the left pad back to 12px and hide text under the icon. */
          padding: 14px 16px 14px 46px !important;
          color: var(--text) !important; font-size: 14.5px; outline: none;
          transition: border-color .18s, box-shadow .18s, background .18s;
        }
        .login-input.has-toggle { padding-right: 46px !important; }
        .login-input:focus { border-color: var(--accent) !important; box-shadow: var(--ring) !important; }
        .login-input::placeholder { color: var(--muted); opacity: .7; }
      `}</style>

      {/* Floating aqua blobs — soft, blurred, gently drifting */}
      <div style={{
        position: 'absolute', top: '-12%', left: '-8%', width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, rgba(34,211,238,.34), transparent 68%)',
        filter: 'blur(46px)', pointerEvents: 'none', animation: 'blobFloat1 14s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute', bottom: '-14%', right: '-10%', width: 460, height: 460, borderRadius: '50%',
        background: 'radial-gradient(circle at 60% 60%, rgba(8,145,178,.34), transparent 68%)',
        filter: 'blur(52px)', pointerEvents: 'none', animation: 'blobFloat2 17s ease-in-out infinite'
      }} />

      {/* Glass login card */}
      <div style={{
        position: 'relative',
        background: 'var(--glass)',
        WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 22,
        padding: '38px 30px 32px', width: 'min(388px, 94vw)',
        boxShadow: 'var(--shadow-lg)', animation: 'loginCardIn .6s cubic-bezier(.2,.8,.2,1) both'
      }}>
        {/* Top aqua accent line */}
        <div style={{
          position: 'absolute', top: 0, left: '18%', right: '18%', height: 3, borderRadius: 3,
          background: 'var(--grad-primary)', boxShadow: '0 0 18px var(--glow-aqua)'
        }} />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 14px' }}>
            {/* Glowing halo behind the drop */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'radial-gradient(circle, var(--glow-aqua), transparent 70%)',
              animation: 'haloPulse 3.4s ease-in-out infinite'
            }} />
            <div style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              background: 'var(--grad-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40, boxShadow: '0 10px 30px -6px var(--glow-aqua), inset 0 2px 8px rgba(255,255,255,.25)',
              animation: 'dropBob 3.4s ease-in-out infinite'
            }}>💧</div>
          </div>
          <h1 className="gradient-text" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 5 }}>
            SHC Dashboard
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Water Purifier Management System<br />
            <span style={{ fontWeight: 600, color: 'var(--accent2)' }}>Sri Hamsini &amp; Chandra Enterprises</span>
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244,63,94,.12)', border: '1px solid var(--red)',
            borderRadius: 12, padding: '11px 13px', marginBottom: 16,
            fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8,
            animation: 'fieldIn .3s ease both'
          }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          {/* Employee ID */}
          <div className="login-field" style={{ marginBottom: 15, animationDelay: '.08s' }}>
            <label style={labelStyle}>Employee ID</label>
            <div style={inputWrap}>
              <span style={iconStyle}>🪪</span>
              <input
                className="login-input"
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Enter Employee ID"
                autoComplete="username"
                style={{ letterSpacing: 1, fontWeight: 600 }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field" style={{ marginBottom: 22, animationDelay: '.16s' }}>
            <label style={labelStyle}>Password</label>
            <div style={inputWrap}>
              <span style={iconStyle}>🔒</span>
              <input
                className="login-input has-toggle"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 6,
                  opacity: .85
                }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-field"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, borderRadius: 12, justifyContent: 'center', animationDelay: '.24s' }}
            disabled={loading}
          >
            {loading ? '⏳ Logging in…' : '🔑 Login'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 10.5, color: 'var(--muted)', opacity: .8 }}>
          Secure access · Telangana &amp; Andhra Pradesh operations
        </div>
      </div>
    </div>
  )
}
