import { useState } from 'react'
import { usePwaStore, isStandalone, isIOS } from '../store/pwaStore'

// A small, attention-seeking install pill in the dashboard header (beside the app
// name). It STAYS until the app is actually installed — it does NOT disappear just
// because the browser's one-shot install event was used up. Tapping always does
// something: fire the native install if we have it, otherwise show the exact manual
// steps for this device (iOS Safari, or the browser's ⋮ menu).
export default function InstallButton() {
  const { canInstall, installed, promptInstall } = usePwaStore()
  const [hint, setHint] = useState(false)

  if (installed || isStandalone()) return null // gone for good once installed

  const ios = isIOS()

  async function onClick() {
    if (canInstall) {
      const outcome = await promptInstall()
      // If the native prompt wasn't available or was dismissed, guide them instead
      // of leaving nothing to do.
      if (outcome !== 'accepted') setHint(true)
    } else {
      setHint(v => !v)
    }
  }

  const steps = ios
    ? <>Tap <b style={{ color: 'var(--text,#e5edf5)' }}>Share ⬆︎</b> at the bottom, then <b style={{ color: 'var(--text,#e5edf5)' }}>“Add to Home Screen”</b>.</>
    : <>Open your browser’s <b style={{ color: 'var(--text,#e5edf5)' }}>⋮ menu</b> and tap <b style={{ color: 'var(--text,#e5edf5)' }}>“Add to Home screen”</b> / <b style={{ color: 'var(--text,#e5edf5)' }}>“Install app”</b>.</>

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

      {hint && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 2100,
          width: 250, padding: '11px 13px', borderRadius: 12, fontSize: 11.5, lineHeight: 1.55,
          background: 'var(--surface, #0f172a)', border: '1px solid var(--border, #1e2a3a)',
          color: 'var(--muted, #90a4b8)', boxShadow: '0 14px 40px -12px rgba(0,0,0,.55)', textAlign: 'left'
        }}>
          <b style={{ color: 'var(--text,#e5edf5)' }}>Install this app:</b><br />
          {steps}
          <button onClick={() => setHint(false)} style={{
            display: 'block', marginTop: 8, marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--accent, #22d3ee)', fontSize: 11, fontWeight: 700, cursor: 'pointer'
          }}>Got it</button>
        </div>
      )}
    </div>
  )
}
