import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

// Enforces camera + location for field technicians. If either is missing, a
// blocking screen appears — on every app open/foreground and again after each
// attempt — until both are granted. Browsers refuse to re-show the native popup
// after a hard "Block", so in that case we show how to re-enable in Settings and
// keep re-checking (on visibility change + on the button) until it's turned on.
//
// State per permission is one of: 'checking' | 'granted' | 'denied' | 'need'.
// We trust a *successful request* as proof of grant, because some browsers
// (iOS Safari / Firefox) can't report camera state via the Permissions API —
// relying on the query alone would lock those users out forever.
function reconcile(prev, queryState) {
  if (queryState === 'granted') return 'granted'
  if (queryState === 'denied') return 'denied'
  // Query said 'prompt' or couldn't tell: keep an already-confirmed result.
  if (prev === 'granted' || prev === 'denied') return prev
  return 'need'
}

export default function PermissionGate() {
  const logout = useAuthStore(s => s.logout)
  const [cam, setCam] = useState('checking')
  const [geo, setGeo] = useState('checking')
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    let c, g
    if (navigator.permissions?.query) {
      try { c = (await navigator.permissions.query({ name: 'camera' })).state } catch {}
      try { g = (await navigator.permissions.query({ name: 'geolocation' })).state } catch {}
    }
    setCam(prev => reconcile(prev, c))
    setGeo(prev => reconcile(prev, g))
  }, [])

  useEffect(() => {
    check()
    // Re-check whenever the technician returns to the app (e.g. back from phone
    // Settings after enabling) — this is the "every time they open it" behaviour.
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    let camP, geoP
    ;(async () => {
      try { camP = await navigator.permissions.query({ name: 'camera' }); camP.onchange = check } catch {}
      try { geoP = await navigator.permissions.query({ name: 'geolocation' }); geoP.onchange = check } catch {}
    })()
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (camP) camP.onchange = null
      if (geoP) geoP.onchange = null
    }
  }, [check])

  async function requestAll() {
    setBusy(true)
    // Camera — opens briefly just to trigger/confirm the permission, then stops.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      s.getTracks().forEach(t => t.stop())
      setCam('granted')
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) setCam('denied')
      // NotFoundError (no camera) / other transient errors: leave for retry.
    }
    // Location
    await new Promise(res => {
      if (!navigator.geolocation) return res()
      navigator.geolocation.getCurrentPosition(
        () => { setGeo('granted'); res() },
        (err) => { if (err && err.code === 1) setGeo('denied'); res() },  // code 1 = PERMISSION_DENIED
        { timeout: 12000, enableHighAccuracy: false }
      )
    })
    setBusy(false)
  }

  // Don't flash the gate during the very first async check.
  if (cam === 'checking' || geo === 'checking') return null
  const camOk = cam === 'granted'
  const geoOk = geo === 'granted'
  if (camOk && geoOk) return null

  const blocked = cam === 'denied' || geo === 'denied'

  const Row = ({ ok, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <span style={{ fontSize: 20 }}>{ok ? '✅' : '⛔'}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ok ? 'var(--green)' : 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ok ? 'Allowed' : 'Required — not allowed yet'}</div>
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1680, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto'
    }}>
      <div style={{ width: 'min(440px, 100%)', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>📷📍</div>
        <h2 className="gradient-text" style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Permissions Required
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
          As a field technician you must allow <b style={{ color: 'var(--text)' }}>Camera</b> and{' '}
          <b style={{ color: 'var(--text)' }}>Location</b>. Camera captures your work-proof photos, and
          Location stamps &amp; verifies every visit. The app stays locked until both are on.
        </p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 16px', marginBottom: 16 }}>
          <Row ok={camOk} label="Camera" />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <Row ok={geoOk} label="Location" />
        </div>

        {blocked && (
          <div className="alert alert-yellow" style={{ textAlign: 'left', marginBottom: 16, display: 'block' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ It was blocked before, so the phone won't ask again.</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              Turn it back on, then tap “Re-check”:<br />
              • <b>In Chrome:</b> tap the <b>🔒 / ⓘ</b> icon to the left of the web address → <b>Permissions</b> → turn on <b>Camera</b> &amp; <b>Location</b> → reload.<br />
              • <b>Installed app:</b> phone <b>Settings → Apps → SHC Technician → Permissions</b> → enable <b>Camera</b> &amp; <b>Location</b>.
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={requestAll} disabled={busy}
          style={{ width: '100%', padding: 14, fontSize: 15, borderRadius: 12, justifyContent: 'center' }}>
          {busy ? '⏳ Checking…' : blocked ? '🔄 I’ve enabled it — Re-check' : '✅ Allow Camera & Location'}
        </button>

        <button onClick={() => { logout(); window.location.href = '/login' }}
          style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
