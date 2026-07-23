import { useState } from 'react'
import { usePwaStore, isStandalone } from '../store/pwaStore'

// A friendly one-tap "Install app" card shown to visitors on any page (incl. login).
// Dismissing hides it for THIS view only — it is intentionally NOT remembered, so it
// pops up again on the next refresh/visit and keeps asking until the app is installed.
// Once installed it never shows. iPhone/iPad can't be installed programmatically
// (Apple blocks it), so there we show the Share -> Add to Home Screen hint.
export default function InstallPrompt() {
  const { canInstall, installed, ios, promptInstall } = usePwaStore()
  const [dismissed, setDismissed] = useState(false) // per-view only — never persisted

  if (installed || isStandalone()) return null
  const show = !dismissed && (canInstall || ios)
  if (!show) return null

  return (
    <>
      <style>{`@keyframes pwaCardUp { from { opacity:0; transform: translate(-50%, 30px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
      <div style={{
        position: 'fixed', left: '50%', bottom: 'max(16px, env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)', zIndex: 2000, width: 'min(420px, calc(100vw - 24px))',
        background: 'var(--surface, #0f172a)', border: '1px solid var(--border, #1e2a3a)',
        borderRadius: 16, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 16px 44px -12px rgba(0,0,0,.55)', animation: 'pwaCardUp .4s cubic-bezier(.2,.8,.2,1) both'
      }}>
        <img src="/icon-192.png" alt="" width="46" height="46"
          style={{ borderRadius: 11, flex: '0 0 auto', boxShadow: '0 3px 10px -3px rgba(0,0,0,.5)' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text, #e5edf5)', letterSpacing: '-0.01em' }}>
            Install SHC Dashboard
          </div>
          {ios && !canInstall ? (
            <div style={{ fontSize: 11.5, color: 'var(--muted, #90a4b8)', lineHeight: 1.5, marginTop: 2 }}>
              Tap <b style={{ color: 'var(--text,#e5edf5)' }}>Share ⬆︎</b> below, then{' '}
              <b style={{ color: 'var(--text,#e5edf5)' }}>“Add to Home Screen”</b>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--muted, #90a4b8)', lineHeight: 1.5, marginTop: 2 }}>
              Add it to your home screen — opens like an app & works offline.
            </div>
          )}
        </div>

        {(!ios || canInstall) && (
          <button onClick={promptInstall} style={{
            flex: '0 0 auto', fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 10,
            background: 'var(--grad-primary, linear-gradient(135deg,#22d3ee,#0891b2))', color: '#fff',
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px -4px rgba(8,145,178,.7)'
          }}>
            Install
          </button>
        )}

        <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{
          flex: '0 0 auto', width: 30, height: 30, borderRadius: 8, lineHeight: 1,
          background: 'var(--surface2, #16202e)', border: '1px solid var(--border, #1e2a3a)',
          color: 'var(--muted, #90a4b8)', cursor: 'pointer', fontSize: 15
        }}>
          ✕
        </button>
      </div>
    </>
  )
}
