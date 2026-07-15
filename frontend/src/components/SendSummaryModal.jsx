import { useState } from 'react'

export default function SendSummaryModal({ summary, onClose }) {
  const [copied, setCopied] = useState(false)

  function copyText() {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(onClose, 1200)
  }

  function sendWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank')
    onClose()
  }

  function sendEmail() {
    const subject = encodeURIComponent('Daily Task Summary')
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${encodeURIComponent(summary)}`, '_blank')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📤 Send Daily Summary</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={copyText}>
            📋 {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={sendWhatsApp}>
            💬 Send via WhatsApp
          </button>
          <button className="btn btn-outline" style={{ justifyContent: 'flex-start', padding: '12px 16px' }} onClick={sendEmail}>
            ✉️ Send via Email
          </button>
        </div>
      </div>
    </div>
  )
}
