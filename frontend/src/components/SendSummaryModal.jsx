import { useState } from 'react'

function formatPhoneForWhatsApp(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits
}

export default function SendSummaryModal({ summary, employees, onClose }) {
  const [mode, setMode] = useState('choose')   // 'choose' | 'whatsapp' | 'email'
  const [manualValue, setManualValue] = useState('')
  const [copied, setCopied] = useState(false)

  function copyText() {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(onClose, 1200)
  }

  function sendWhatsApp(phone) {
    const number = formatPhoneForWhatsApp(phone)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(summary)}`, '_blank')
    onClose()
  }

  function sendEmail(email) {
    const subject = encodeURIComponent('Daily Task Summary')
    window.location.href = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(summary)}`
    onClose()
  }

  const contactsWithPhone = employees.filter(e => e.phone)
  const contactsWithEmail = employees.filter(e => e.email)

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {mode === 'choose' && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📤 Send Daily Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={copyText}>
                📋 {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
              <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={() => setMode('whatsapp')}>
                💬 Send via WhatsApp
              </button>
              <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={() => setMode('email')}>
                ✉️ Send via Email
              </button>
            </div>
          </>
        )}

        {mode === 'whatsapp' && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>💬 Send via WhatsApp</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>SELECT A CONTACT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {contactsWithPhone.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No saved phone numbers yet.</div>
              )}
              {contactsWithPhone.map(e => (
                <button key={e.id} className="btn btn-outline btn-sm"
                  style={{ justifyContent: 'space-between', display: 'flex' }}
                  onClick={() => sendWhatsApp(e.phone)}>
                  <span>{e.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{e.phone}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>OR TYPE A NUMBER</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="e.g. 9876543210"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
              />
              <button className="btn btn-primary" disabled={!manualValue.trim()} onClick={() => sendWhatsApp(manualValue.trim())}>Send</button>
            </div>
            <button className="btn btn-outline" style={{ marginTop: 14, width: '100%' }} onClick={() => setMode('choose')}>← Back</button>
          </>
        )}

        {mode === 'email' && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>✉️ Send via Email</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>SELECT A CONTACT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {contactsWithEmail.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No saved email addresses yet.</div>
              )}
              {contactsWithEmail.map(e => (
                <button key={e.id} className="btn btn-outline btn-sm"
                  style={{ justifyContent: 'space-between', display: 'flex' }}
                  onClick={() => sendEmail(e.email)}>
                  <span>{e.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{e.email}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>OR TYPE AN EMAIL ADDRESS</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="name@example.com"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
              />
              <button className="btn btn-primary" disabled={!manualValue.trim()} onClick={() => sendEmail(manualValue.trim())}>Send</button>
            </div>
            <button className="btn btn-outline" style={{ marginTop: 14, width: '100%' }} onClick={() => setMode('choose')}>← Back</button>
          </>
        )}
      </div>
    </div>
  )
}
