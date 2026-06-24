import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../../api/axios'

// ── Camera capture component ─────────────────────────────────────────────────
function CameraCapture({ onCapture, onClose, gps }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setReady(true)
      }
    }).catch(() => {
      setError('Camera access denied. Please allow camera permission and try again.')
    })
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    const W = video.videoWidth
    const H = video.videoHeight
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    // Draw the photo
    ctx.drawImage(video, 0, 0)

    // ── Watermark: GPS + timestamp burned into the image ──────────────────
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    const gpsStr  = gps ? `GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'GPS: unavailable'

    const lines = [
      dateStr + '  ' + timeStr,
      gpsStr,
    ]

    const fontSize = Math.max(14, Math.round(W * 0.022))
    const padding  = Math.round(fontSize * 0.6)
    const lineH    = fontSize + padding
    const boxH     = lineH * lines.length + padding * 2
    const boxY     = H - boxH - Math.round(H * 0.015)
    const boxX     = Math.round(W * 0.015)

    // Semi-transparent dark background strip
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, W - boxX * 2, boxH, 6)
    ctx.fill()

    // Text
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textBaseline = 'top'
    lines.forEach((line, i) => {
      const y = boxY + padding + i * lineH
      // Shadow for legibility on any background
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillText(line, boxX + padding + 1, y + 1)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(line, boxX + padding, y)
    })
    ctx.restore()
    // ─────────────────────────────────────────────────────────────────────

    canvas.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      streamRef.current?.getTracks().forEach(t => t.stop())
      onCapture(file, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 1100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      {error ? (
        <div style={{ color: '#f87171', fontSize: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📵</div>
          {error}
          <br /><br />
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted style={{
            width: '100%', maxWidth: 640, maxHeight: '70vh', objectFit: 'cover',
            borderRadius: 8, display: ready ? 'block' : 'none'
          }} />
          {!ready && (
            <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Starting camera…</div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
            <button onClick={capture} disabled={!ready} style={{
              width: 70, height: 70, borderRadius: '50%',
              background: ready ? '#fff' : '#475569', border: '4px solid #94a3b8',
              cursor: ready ? 'pointer' : 'not-allowed', fontSize: 28
            }}>📸</button>
            <button className="btn btn-outline" onClick={onClose}
              style={{ alignSelf: 'center' }}>Cancel</button>
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 12 }}>
            Tap 📸 to capture — live camera only, no file uploads
          </div>
        </>
      )}
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────
export default function ProofUploadModal({ task, onClose, onSubmitted }) {
  const [gps, setGps] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(true)
  const [photos, setPhotos] = useState({ before: null, after: null, item: null })
  const [previews, setPreviews] = useState({ before: null, after: null, item: null })
  const [activeCamera, setActiveCamera] = useState(null) // 'before' | 'after' | 'item'
  const [itemInstalled, setItemInstalled] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { captureGPS() }, [])

  function captureGPS() {
    setGpsLoading(true); setGpsError('')
    if (!navigator.geolocation) {
      setGpsError('GPS not supported.'); setGpsLoading(false); return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setGpsLoading(false)
      },
      err => { setGpsError(`GPS failed: ${err.message}`); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function handleCaptured(type, file, previewUrl) {
    setPhotos(p => ({ ...p, [type]: file }))
    setPreviews(p => ({ ...p, [type]: previewUrl }))
    setActiveCamera(null)
  }

  async function handleSubmit() {
    if (!photos.before && !photos.after && !photos.item) {
      setError('Please take at least one photo.'); return
    }
    setSubmitting(true); setError('')
    try {
      const fd = new FormData()
      fd.append('task_id', task.id)
      fd.append('item_installed', itemInstalled)
      fd.append('remarks', remarks)
      if (gps) { fd.append('latitude', gps.lat); fd.append('longitude', gps.lng) }
      if (photos.before) fd.append('before_photo', photos.before)
      if (photos.after)  fd.append('after_photo',  photos.after)
      if (photos.item)   fd.append('item_photo',   photos.item)
      await api.post('/api/field-reports/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSubmitted()
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Try again.')
    }
    setSubmitting(false)
  }

  const slots = [
    { key: 'before', label: 'Before Photo',  icon: '📷', desc: 'Take photo BEFORE work' },
    { key: 'after',  label: 'After Photo',   icon: '✅', desc: 'Take photo AFTER work' },
    { key: 'item',   label: 'Item Photo',    icon: '📦', desc: 'Take photo of item installed' },
  ]

  return (
    <>
      {activeCamera && (
        <CameraCapture
          gps={gps}
          onCapture={(file, url) => handleCaptured(activeCamera, file, url)}
          onClose={() => setActiveCamera(null)}
        />
      )}

      <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
        <div className="modal-box" style={{ maxWidth: 500 }}>
          <button className="modal-close" onClick={onClose}>✕</button>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📸 Submit Work Proof</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{task.title}</div>

          {/* GPS */}
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            background: gps ? 'rgba(52,211,153,.1)' : gpsError ? 'rgba(248,113,113,.1)' : 'rgba(251,191,36,.1)',
            border: `1px solid ${gps ? 'var(--green)' : gpsError ? 'var(--red)' : 'var(--yellow)'}`,
            fontSize: 12
          }}>
            {gpsLoading && <span>📡 Getting GPS location…</span>}
            {gps && !gpsLoading && (
              <span style={{ color: 'var(--green)' }}>
                ✅ GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                <span style={{ color: 'var(--muted)' }}> (±{Math.round(gps.accuracy)}m)</span>
              </span>
            )}
            {gpsError && !gpsLoading && (
              <span style={{ color: 'var(--red)' }}>⚠️ {gpsError}{' '}
                <button onClick={captureGPS} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>Retry</button>
              </span>
            )}
          </div>

          {/* Item installed */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Item Installed / Work Done</label>
            <input value={itemInstalled} onChange={e => setItemInstalled(e.target.value)}
              placeholder="e.g. MCF Filter, Antiscalant, Pump repair…" />
          </div>

          {/* Photo slots — camera only, no file picker */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Photos — Camera Only
            </div>
            {slots.map(slot => (
              <div key={slot.key} style={{
                border: `2px dashed ${photos[slot.key] ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 10, padding: 12, marginBottom: 10,
                background: photos[slot.key] ? 'rgba(52,211,153,.05)' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                {previews[slot.key] ? (
                  <img src={previews[slot.key]} alt={slot.key}
                    style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 70, height: 70, background: 'var(--surface)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
                    {slot.icon}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{slot.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{slot.desc}</div>
                  <button onClick={() => setActiveCamera(slot.key)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: photos[slot.key] ? 'var(--green)' : 'var(--accent)', color: '#fff',
                    border: 'none', cursor: 'pointer'
                  }}>
                    📷 {photos[slot.key] ? 'Retake' : 'Open Camera'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Remarks */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Remarks (optional)</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
              placeholder="Any notes…" />
          </div>

          {error && (
            <div className="alert alert-red" style={{ marginBottom: 12 }}>
              <span>⚠️</span><div>{error}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 14 }}
              onClick={handleSubmit} disabled={submitting}>
              {submitting ? '⏳ Submitting…' : '✅ Submit Proof & Mark Done'}
            </button>
            <button className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            Submitting will mark your attendance as Present today.
          </div>
        </div>
      </div>
    </>
  )
}
