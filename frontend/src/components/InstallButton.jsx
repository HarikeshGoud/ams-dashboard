import { useState } from 'react'
import { usePwaStore, isStandalone } from '../store/pwaStore'

// A small, attention-seeking install pill that lives in the dashboard header
// (beside the app name) and STAYS until the app is installed. Complements the
// pop-up card — a persistent second entry point. Hidden once installed.
export default function InstallButton() {
  const { canInstall, installed, ios, promptInstall } = usePwaStore()
  const [iosHint, setIosHint] = useState(false)

  if (installed || isStandalone()) return null
  if (!canInstall && !ios) return null // nothing we can do on this browser

  const onClick = () => {
    if (ios && !canInstall) setIosHint(v => !v)
    else promptInstall()
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <style>{`
        @keyframes pwaPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,211,238,.55); }
          50%     { box-shadow: 0 0 0 6px rgba(34,211,238,0); }
        }
      `}</style>
      <button onClick={onClick} title="Install app" style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 999,
        background: 'var(--grad-primary, linear-gradient(135deg,#22d3ee,#0891b2))',
        color: '#fff', border: 'none', whiteSpace: 'nowrap',
        animation: 'pwaPulse 2s ease-in-out infinite',
        textShadow: '0 1px 2px rgba(3,35,45,.35)'
      }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>⬇</span> Install
      </button>

      {iosHint && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 2100,
          width: 230, padding: '10px 12px', borderRadius: 12, fontSize: 11.5, lineHeight: 1.55,
          background: 'var(--surface, #0f172a)', border: '1px solid var(--border, #1e2a3a)',
          color: 'var(--muted, #90a4b8)', boxShadow: '0 14px 40px -12px rgba(0,0,0,.55)'
        }}>
          <b style={{ color: 'var(--text,#e5edf5)' }}>Install on iPhone:</b><br />
          Tap <b style={{ color: 'var(--text,#e5edf5)' }}>Share ⬆︎</b> below, then{' '}
          <b style={{ color: 'var(--text,#e5edf5)' }}>“Add to Home Screen”</b>.
          <button onClick={() => setIosHint(false)} style={{
            display: 'block', marginTop: 8, marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--accent, #22d3ee)', fontSize: 11, fontWeight: 700, cursor: 'pointer'
          }}>Got it</button>
        </div>
      )}
    </div>
  )
}
