import { useState } from 'react'
import api from '../api/axios'

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 6) return setError('New password must be at least 6 characters')
    if (next !== confirm) return setError('New passwords do not match')
    if (next === current) return setError('New password must be different from current')
    setLoading(true)
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password: next
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed. Try again.')
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 40px 10px 12px',
    color: 'var(--text)', fontSize: 14, outline: 'none'
  }

  function EyeBtn({ show, toggle }) {
    return (
      <button type="button" onClick={toggle} style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 4
      }}>{show ? '🙈' : '👁️'}</button>
    )
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔑 Change Password</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
          Choose a strong password you haven't used before.
        </p>

        {success ? (
          <div>
            <div style={{
              background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)',
              borderRadius: 10, padding: '20px', textAlign: 'center', marginBottom: 16
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>Password Changed!</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Your new password is active now.</div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Current password */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showCurrent ? 'text' : 'password'} value={current}
                  onChange={e => setCurrent(e.target.value)} style={inputStyle}
                  placeholder="Your current password" required />
                <EyeBtn show={showCurrent} toggle={() => setShowCurrent(s => !s)} />
              </div>
            </div>

            {/* New password */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNext ? 'text' : 'password'} value={next}
                  onChange={e => setNext(e.target.value)} style={inputStyle}
                  placeholder="Min. 6 characters" required />
                <EyeBtn show={showNext} toggle={() => setShowNext(s => !s)} />
              </div>
              {/* Strength bar */}
              {next.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 4, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4, transition: 'width .3s',
                      width: next.length < 6 ? '20%' : next.length < 8 ? '50%' : next.length < 10 ? '75%' : '100%',
                      background: next.length < 6 ? 'var(--red)' : next.length < 8 ? 'var(--yellow)' : 'var(--green)'
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    {next.length < 6 ? 'Too short' : next.length < 8 ? 'Weak' : next.length < 10 ? 'Good' : 'Strong'}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNext ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)} style={{
                    ...inputStyle,
                    borderColor: confirm && confirm !== next ? 'var(--red)' : confirm && confirm === next ? 'var(--green)' : 'var(--border)'
                  }}
                  placeholder="Re-enter new password" required />
                {confirm && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>
                    {confirm === next ? '✅' : '❌'}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(248,113,113,.1)', border: '1px solid var(--red)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 14,
                fontSize: 12, color: 'var(--red)'
              }}>⚠️ {error}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? '⏳ Saving…' : 'Save New Password'}
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
