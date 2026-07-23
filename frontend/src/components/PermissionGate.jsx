import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

// Blocking permission gate. Which permissions are required is passed in by the
// layout (per role):
//   • Technicians / Desk → location + camera
//   • Camera is auto-SKIPPED if the device has no camera (e.g. a desk PC), so
//     those users are only asked for location.
// If a required permission is missing, a blocking screen appears — on every app
// open/foreground and after each attempt — until it's granted. Browsers refuse to
// re-show the native popup after a hard "Block", so we then show how to re-enable
// in Settings and keep re-checking (visibility change + button) until it's on.
//
// Per-permission state: 'checking' | 'granted' | 'denied' | 'need'. We trust a
// *successful request* as proof of grant, because some browsers (iOS Safari /
// Firefox) can't report camera state via the Permissions API.
function reconcile(prev, queryState) {
  if (queryState === 'granted') return 'granted'
  if (queryState === 'denied') return 'denied'
  if (prev === 'granted' || prev === 'denied') return prev
  return 'need'
}

export default function PermissionGate({ camera = true, location = true }) {
  const logout = useAuthStore(s => s.logout)
  const [camPresent, setCamPresent] = useState(null) // null = still detecting
  const [cam, setCam] = useState('checking')
  const [geo, setGeo] = useState('checking')
  const [busy, setBusy] = useState(false)

  // Detect whether this device even has a camera. If camera isn't required for
  // this role, or the device has none, we drop the camera requirement entirely.
  useEffect(() => {
    let cancelled = false
    if (!camera) { setCamPresent(false); return }
    ;(async () => {
      try {
        const devs = await navigator.mediaDevices?.enumerateDevices?.()
        const has = Array.isArray(devs) && devs.some(d => d.kind === 'videoinput')
        if (!cancelled) setCamPresent(has)
      } catch {
        if (!cancelled) setCamPresent(true) // can't tell → require it (safer)
      }
    })()
    return () => { cancelled = true }
  }, [camera])

  const needCam = camera && camPresent === true
  const needGeo = location

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
    if (needCam) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        s.getTracks().forEach(t => t.stop())
        setCam('granted')
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) setCam('denied')
      }
    }
    if (needGeo) {
      await new Promise(res => {
        if (!navigator.geolocation) return res()
        navigator.geolocation.getCurrentPosition(
          () => { setGeo('granted'); res() },
          (err) => { if (err && err.code === 1) setGeo('denied'); res() }, // 1 = PERMISSION_DENIED
          { timeout: 12000, enableHighAccuracy: false }
        )
      })
    }
    setBusy(false)
  }

  // Still detecting device / permission state — don't flash the gate.
  if (camPresent === null || cam === 'checking' || geo === 'checking') return null

  const camOk = !needCam || cam === 'granted'
  const geoOk = !needGeo || geo === 'granted'
  if (camOk && geoOk) return null // nothing (applicable) is missing

  const blocked = (needCam && cam === 'denied') || (needGeo && geo === 'denied')

  const reqLabel = needCam && needGeo ? 'Camera & Location' : needCam ? 'Camera' : 'Location'
  const reqWord = needCam && needGeo ? 'both are' : 'it is'

  const Row = ({ ok, label, why }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <span style={{ fontSize: 20 }}>{ok ? '✅' : '⛔'}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ok ? 'var(--green)' : 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ok ? 'Allowed' : why}</div>
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1680, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto'
    }}>
      <div style={{ width: 'min(440px, 100%)', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>{needCam ? '📷📍' : '📍'}</div>
        <h2 className="gradient-text" style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Permission{needCam && needGeo ? 's' : ''} Required
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
          To use the app you must allow <b style={{ color: 'var(--text)' }}>{reqLabel}</b>.{' '}
          {needCam && 'Camera captures work-proof photos, and '}
          Location stamps &amp; verifies your activity. The app stays locked until {reqWord} on.
        </p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 16px', marginBottom: 16 }}>
          {needCam && <Row ok={cam === 'granted'} label="Camera" why="Required — not allowed yet" />}
          {needCam && needGeo && <div style={{ height: 1, background: 'var(--border)' }} />}
          {needGeo && <Row ok={geo === 'granted'} label="Location" why="Required — not allowed yet" />}
        </div>

        {blocked && (
          <div className="alert alert-yellow" style={{ textAlign: 'left', marginBottom: 16, display: 'block' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ It was blocked before, so the device won't ask again.</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              Turn it back on, then tap “Re-check”:<br />
              • <b>In the browser:</b> tap the <b>🔒 / ⓘ</b> icon left of the web address → <b>Permissions</b> → enable <b>{reqLabel}</b> → reload.<br />
              • <b>Installed app:</b> phone <b>Settings → Apps → SHC Dashboard → Permissions</b> → enable <b>{reqLabel}</b>.
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={requestAll} disabled={busy}
          style={{ width: '100%', padding: 14, fontSize: 15, borderRadius: 12, justifyContent: 'center' }}>
          {busy ? '⏳ Checking…' : blocked ? '🔄 I’ve enabled it — Re-check' : `✅ Allow ${reqLabel}`}
        </button>

        <button onClick={() => { logout(); window.location.href = '/login' }}
          style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
