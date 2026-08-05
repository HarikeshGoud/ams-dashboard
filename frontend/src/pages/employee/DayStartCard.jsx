import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import CameraCapture from '../../components/CameraCapture'

// "Start day from home" — the waypoint that makes travel start at home instead of at the first
// school.
//
// Travel is calculated from the GPS on proof photos, and the first proof of the day is the first
// SITE, so the ride from home to it was never in the total. This records that missing point
// before the technician leaves: a photo, plus the GPS of the moment.
//
// The photo isn't decoration. This raises what the company pays out, and no technician has a
// home coordinate on file to check the claim against, so the picture is the only thing making it
// auditable. GPS is required for the same reason — without a coordinate there is nothing for the
// travel maths to use.
//
// Hidden entirely where travel allowance doesn't apply to this technician's area; asking someone
// to photograph their doorstep for an allowance they can't claim is worse than not offering it.
export default function DayStartCard({ onRecorded }) {
  const [canAccess, setCanAccess] = useState(null)   // null = still checking
  const [record, setRecord]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [camera, setCamera]   = useState(false)
  const [gps, setGps]         = useState(null)
  const [gpsErr, setGpsErr]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const captureGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsErr('This device has no GPS.'); return }
    setGpsErr('')
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude,
                      acc: pos.coords.accuracy }),
      () => setGpsErr('Could not get GPS. Allow location, then tap Retry.'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get('/api/travel/my-access').catch(() => ({ data: { can_access: false } })),
      api.get('/api/travel/day-start').catch(() => ({ data: null })),
    ]).then(([acc, ds]) => {
      if (!alive) return
      setCanAccess(!!acc.data?.can_access)
      setRecord(ds.data || null)
      setLoading(false)
      if (acc.data?.can_access && !ds.data) captureGps()
    })
    return () => { alive = false }
  }, [captureGps])

  async function upload(file) {
    if (!gps) { setError('Waiting for GPS — tap Retry once it locks, then take the photo again.'); return }
    setSaving(true); setError('')
    const fd = new FormData()
    fd.append('latitude', gps.lat)
    fd.append('longitude', gps.lng)
    fd.append('label', 'Home')
    if (file) fd.append('photo', file)
    try {
      const r = await api.post('/api/travel/day-start', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000,
      })
      setRecord(r.data?.day_start || null)
      if (onRecorded) onRecorded(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not save your start point. Try again.')
    }
    setSaving(false)
  }

  if (loading || canAccess === false) return null

  const time = record?.created_at
    ? new Date(record.created_at).toLocaleTimeString('en-IN',
        { hour: '2-digit', minute: '2-digit', hour12: true })
    : null

  return (
    <>
      {record ? (
        <div style={{
          background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', borderRadius: 12,
          padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {record.photo_url && (
            <img src={record.photo_url} alt="Start point"
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <div style={{ flex: 1, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: 'var(--green)' }}>
              🏠 Started from home{time ? ` at ${time}` : ''}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
              Today's travel is counted from here, not from your first school.
            </div>
          </div>
          <button onClick={() => { captureGps(); setCamera(true) }} disabled={saving} style={{
            padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)',
            flexShrink: 0,
          }}>{saving ? '…' : 'Retake'}</button>
        </div>
      ) : (
        <div style={{
          background: 'rgba(34,211,238,.08)', border: '1px solid var(--accent)', borderRadius: 12,
          padding: '12px 14px', marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
            🏠 Starting from home?
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Take a photo before you leave and your travel is paid from home instead of from your
            first school. Do it once, before the first visit.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setCamera(true)} disabled={saving || !gps} style={{
              padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: (saving || !gps) ? 'not-allowed' : 'pointer',
              background: gps ? 'var(--accent)' : 'var(--surface2)',
              color: gps ? '#fff' : 'var(--muted)',
            }}>
              {saving ? '⏳ Saving…' : '📷 Take photo at home'}
            </button>
            <span style={{ fontSize: 11, color: gps ? 'var(--green)' : 'var(--yellow)' }}>
              {gps ? `✅ GPS locked (±${Math.round(gps.acc)}m)` : '📡 Getting GPS…'}
            </span>
            {gpsErr && (
              <button onClick={captureGps} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--muted)', cursor: 'pointer',
              }}>Retry GPS</button>
            )}
          </div>
          {gpsErr && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>⚠️ {gpsErr}</div>}
        </div>
      )}

      {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>{error}</div>}

      {camera && (
        <CameraCapture
          gps={gps}
          showGps={true}
          siteName="Start of day — home"
          onCapture={(file) => { setCamera(false); upload(file) }}
          onClose={() => setCamera(false)}
        />
      )}
    </>
  )
}
