import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../store/authStore'

// Blocking permission gate. Which permissions are required is passed in per role:
//   • Technicians / Desk → location + camera
//   • Camera is auto-SKIPPED if the device has no camera (e.g. a desk PC).
// When the gate appears it AUTO-ASKS (fires the native Allow popup right away) so a
// non-technical user just taps "Allow" — no menus. Only if the permission was hard
// "Blocked" before (browsers then refuse to re-ask via JS) do we reveal the short
// how-to-re-enable steps. Otherwise the only choices are Allow or Sign out.
function reconcile(prev, queryState) {
  if (queryState === 'granted') return 'granted'
  if (queryState === 'denied') return 'denied'
  if (prev === 'granted' || prev === 'denied') return prev
  return 'need'
}

export default function PermissionGate({ camera = true, location = true }) {
  const logout = useAuthStore(s => s.logout)
  const [camPresent, setCamPresent] = useState(null)
  const [cam, setCam] = useState('checking')
  const [geo, setGeo] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false) // settings steps — only after a blocked attempt
  const autoAsked = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (!camera) { setCamPresent(false); return }
    ;(async () => {
      try {
        const devs = await navigator.mediaDevices?.enumerateDevices?.()
        const has = Array.isArray(devs) && devs.some(d => d.kind === 'videoinput')
        if (!cancelled) setCamPresent(has)
      } catch { if (!cancelled) setCamPresent(true) }
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

  const requestAll = useCallback(async () => {
    setBusy(true)
    let camDenied = false, geoDenied = false
    if (needCam) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        s.getTracks().forEach(t => t.stop())
        setCam('granted')
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { setCam('denied'); camDenied = true }
      }
    }
    if (needGeo) {
      await new Promise(res => {
        if (!navigator.geolocation) return res()
        navigator.geolocation.getCurrentPosition(
          () => { setGeo('granted'); res() },
          (err) => { if (err && err.code === 1) { setGeo('denied'); geoDenied = true } res() },
          { timeout: 12000, enableHighAccuracy: false }
        )
      })
    }
    // Only surface the "go to settings" steps if the OS actually refused to ask
    // (a prior hard Block). A fresh prompt that the user simply hasn't answered
    // yet must NOT show scary instructions.
    if (camDenied || geoDenied) setShowHelp(true)
    setBusy(false)
  }, [needCam, needGeo])

  // AUTO-ASK: the moment we know something is needed, fire the native popup once —
  // so the user just sees "Allow?" instead of having to find a button.
  useEffect(() => {
    if (autoAsked.current) return
    if (camPresent === null || cam === 'checking' || geo === 'checking') return
    const needAsk = (needCam && cam === 'need') || (needGeo && geo === 'need')
    if (needAsk) { autoAsked.current = true; requestAll() }
  }, [camPresent, cam, geo, needCam, needGeo, requestAll])

  if (camPresent === null || cam === 'checking' || geo === 'checking') return null
  const camOk = !needCam || cam === 'granted'
  const geoOk = !needGeo || geo === 'granted'
  if (camOk && geoOk) return null

  const reqLabel = needCam && needGeo ? 'Camera & Location' : needCam ? 'Camera' : 'Location'

  const Row = ({ ok, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <span style={{ fontSize: 20 }}>{ok ? '✅' : '⛔'}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ok ? 'var(--green)' : 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ok ? 'Allowed' : 'Tap "Allow" above'}</div>
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
          Allow {reqLabel}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
          Tap <b style={{ color: 'var(--text)' }}>Allow</b> when your {reqLabel.includes('&') ? 'phone asks' : 'device asks'}.
          {needCam && ' Camera is for work-proof photos, '}
          {needCam ? 'and location' : 'Location'} stamps &amp; verifies your visits.
        </p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 16px', marginBottom: 16 }}>
          {needCam && <Row ok={cam === 'granted'} label="Camera" />}
          {needCam && needGeo && <div style={{ height: 1, background: 'var(--border)' }} />}
          {needGeo && <Row ok={geo === 'granted'} label="Location" />}
        </div>

        <button className="btn btn-primary" onClick={requestAll} disabled={busy}
          style={{ width: '100%', padding: 16, fontSize: 16, borderRadius: 12, justifyContent: 'center', fontWeight: 800 }}>
          {busy ? '⏳ Asking…' : `✅ Allow ${reqLabel}`}
        </button>

        {showHelp && (
          <div className="alert alert-yellow" style={{ textAlign: 'left', margin: '16px 0 0', display: 'block' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Still blocked? Turn it on in 2 taps:</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              Tap the <b>🔒 / ⓘ</b> icon just left of the web address at the top → <b>Permissions</b> →
              turn on <b>{reqLabel}</b> → come back (it re-checks automatically).
            </div>
          </div>
        )}

        <button onClick={() => { logout(); window.location.href = '/login' }}
          style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
