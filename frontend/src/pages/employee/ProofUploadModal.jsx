import { useState, useRef, useEffect } from 'react'
import api from '../../api/axios'

const ITEM_LIST = [
  'MCF Filter', 'Antiscalant', 'UF Membrane', 'RO Membrane',
  'Sediment Filter', 'Carbon Filter', 'UV Lamp', 'Pump',
  'Solenoid Valve', 'Float Valve', 'TDS Controller', 'Pressure Gauge',
  'Dosing Pump', 'Flow Restrictor', 'Check Valve', 'Tap / Faucet',
  'Power Supply', 'Control Panel', 'Cleaning / Servicing', 'Other',
]

// ── Camera capture ────────────────────────────────────────────────────────────
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
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); setReady(true) }
    }).catch(() => setError('Camera access denied. Please allow camera permission and try again.'))
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  function capture() {
    const video = videoRef.current, canvas = canvasRef.current
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    const now = new Date()
    const W = canvas.width, H = canvas.height
    const lines = [
      now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '  ' +
      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      gps ? `GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'GPS: unavailable',
    ]
    const fontSize = Math.max(14, Math.round(W * 0.022))
    const padding = Math.round(fontSize * 0.6), lineH = fontSize + padding
    const boxH = lineH * lines.length + padding * 2, boxY = H - boxH - Math.round(H * 0.015), boxX = Math.round(W * 0.015)

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.beginPath(); ctx.roundRect(boxX, boxY, W - boxX * 2, boxH, 6); ctx.fill()
    ctx.font = `bold ${fontSize}px monospace`; ctx.textBaseline = 'top'
    lines.forEach((line, i) => {
      const y = boxY + padding + i * lineH
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(line, boxX + padding + 1, y + 1)
      ctx.fillStyle = '#fff'; ctx.fillText(line, boxX + padding, y)
    })
    ctx.restore()

    canvas.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      streamRef.current?.getTracks().forEach(t => t.stop())
      onCapture(file, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {error ? (
        <div style={{ color: '#f87171', fontSize: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📵</div>{error}<br /><br />
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 640, maxHeight: '70vh', objectFit: 'cover', borderRadius: 8, display: ready ? 'block' : 'none' }} />
          {!ready && <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Starting camera…</div>}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
            <button onClick={capture} disabled={!ready} style={{ width: 70, height: 70, borderRadius: '50%', background: ready ? '#fff' : '#475569', border: '4px solid #94a3b8', cursor: ready ? 'pointer' : 'not-allowed', fontSize: 28 }}>📸</button>
            <button className="btn btn-outline" onClick={onClose} style={{ alignSelf: 'center' }}>Cancel</button>
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 12 }}>Tap 📸 to capture — live camera only</div>
        </>
      )}
    </div>
  )
}

// ── Photo slot ────────────────────────────────────────────────────────────────
function PhotoSlot({ label, desc, icon, preview, onOpen }) {
  return (
    <div style={{
      border: `2px dashed ${preview ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 10, padding: 12, marginBottom: 10,
      background: preview ? 'rgba(52,211,153,.05)' : 'var(--surface2)',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      {preview ? (
        <img src={preview} alt={label} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 70, height: 70, background: 'var(--surface)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{desc}</div>
        <button onClick={onOpen} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, background: preview ? 'var(--green)' : 'var(--accent)',
          color: '#fff', border: 'none', cursor: 'pointer'
        }}>
          📷 {preview ? 'Retake' : 'Open Camera'}
        </button>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ProofUploadModal({ task, onClose, onSubmitted }) {
  const [step, setStep] = useState(1) // 1 = select items, 2 = take photos
  const [selectedItems, setSelectedItems] = useState([])
  const [gps, setGps] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(true)

  // photos: { before, after, item_0, item_1, ... }
  const [photos, setPhotos] = useState({})
  const [previews, setPreviews] = useState({})
  const [activeCamera, setActiveCamera] = useState(null) // slot key string
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { captureGPS() }, [])

  function captureGPS() {
    setGpsLoading(true); setGpsError('')
    if (!navigator.geolocation) { setGpsError('GPS not supported.'); setGpsLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGpsLoading(false) },
      err => { setGpsError(`GPS failed: ${err.message}`); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function toggleItem(item) {
    setSelectedItems(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
  }

  function handleCaptured(key, file, previewUrl) {
    setPhotos(p => ({ ...p, [key]: file }))
    setPreviews(p => ({ ...p, [key]: previewUrl }))
    setActiveCamera(null)
  }

  function proceedToPhotos() {
    if (selectedItems.length === 0) { setError('Please select at least one item.'); return }
    setError(''); setStep(2)
  }

  async function handleSubmit() {
    // Require before + after + all item photos
    const missingItem = selectedItems.findIndex((_, i) => !photos[`item_${i}`])
    if (!photos.before) { setError('Before photo is required.'); return }
    if (!photos.after)  { setError('After photo is required.'); return }
    if (missingItem !== -1) { setError(`Please take photo for: ${selectedItems[missingItem]}`); return }

    setSubmitting(true); setError('')
    try {
      const fd = new FormData()
      fd.append('task_id', task.id)
      fd.append('item_installed', selectedItems.join(', '))
      fd.append('remarks', remarks)
      if (gps) { fd.append('latitude', gps.lat); fd.append('longitude', gps.lng) }
      fd.append('before_photo', photos.before)
      fd.append('after_photo', photos.after)
      // Send item photos: item_photo for first, item_photo_1, item_photo_2… for rest
      selectedItems.forEach((_, i) => {
        if (photos[`item_${i}`]) {
          fd.append(i === 0 ? 'item_photo' : `item_photo_${i}`, photos[`item_${i}`])
        }
      })
      await api.post('/api/field-reports/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSubmitted()
    } catch (e) {
      setError(e.response?.data?.detail || 'Submission failed. Try again.')
    }
    setSubmitting(false)
  }

  const allItemPhotosDone = selectedItems.length > 0 && selectedItems.every((_, i) => !!photos[`item_${i}`])
  const readyToSubmit = photos.before && photos.after && allItemPhotosDone

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
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📸 Submit Work Proof</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{task.title}</div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['Select Items', 'Take Photos'].map((label, i) => {
              const active = step === i + 1, done = step > i + 1
              return (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: active ? 'rgba(56,189,248,.15)' : done ? 'rgba(52,211,153,.15)' : 'var(--surface2)',
                  color: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--muted)',
                  border: `1.5px solid ${active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--border)'}`
                }}>
                  {done ? '✅ ' : `${i + 1}. `}{label}
                </div>
              )
            })}
          </div>

          {/* GPS bar */}
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 11,
            background: gps ? 'rgba(52,211,153,.1)' : gpsError ? 'rgba(248,113,113,.1)' : 'rgba(251,191,36,.1)',
            border: `1px solid ${gps ? 'var(--green)' : gpsError ? 'var(--red)' : 'var(--yellow)'}`
          }}>
            {gpsLoading && <span>📡 Getting GPS…</span>}
            {gps && !gpsLoading && <span style={{ color: 'var(--green)' }}>✅ GPS locked (±{Math.round(gps.accuracy)}m)</span>}
            {gpsError && !gpsLoading && (
              <span style={{ color: 'var(--red)' }}>⚠️ {gpsError}{' '}
                <button onClick={captureGPS} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>Retry</button>
              </span>
            )}
          </div>

          {/* ── STEP 1: Select items ── */}
          {step === 1 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                What did you install / replace / service?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {ITEM_LIST.map(item => {
                  const sel = selectedItems.includes(item)
                  return (
                    <button key={item} onClick={() => toggleItem(item)} style={{
                      padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                      background: sel ? 'rgba(56,189,248,.15)' : 'var(--surface2)',
                      color: sel ? 'var(--accent)' : 'var(--text)',
                    }}>
                      {sel ? '✓ ' : ''}{item}
                    </button>
                  )
                })}
              </div>

              {selectedItems.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(56,189,248,.08)', border: '1px solid var(--accent)', fontSize: 12, marginBottom: 14 }}>
                  <b style={{ color: 'var(--accent)' }}>Selected ({selectedItems.length}):</b>{' '}
                  {selectedItems.join(' · ')}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    You will take: 1 Before + 1 After + {selectedItems.length} item photo{selectedItems.length > 1 ? 's' : ''} = {2 + selectedItems.length} photos total
                  </div>
                </div>
              )}

              {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

              <button className="btn btn-primary" style={{ width: '100%', padding: 12, fontSize: 14 }} onClick={proceedToPhotos}>
                Next — Take Photos ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected) →
              </button>
            </>
          )}

          {/* ── STEP 2: Take photos ── */}
          {step === 2 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                Photos — Camera Only
              </div>

              <PhotoSlot
                label="Before Photo"
                desc="Take photo BEFORE starting work"
                icon="📷"
                preview={previews.before}
                onOpen={() => setActiveCamera('before')}
              />
              <PhotoSlot
                label="After Photo"
                desc="Take photo AFTER completing work"
                icon="✅"
                preview={previews.after}
                onOpen={() => setActiveCamera('after')}
              />

              {selectedItems.map((item, i) => (
                <PhotoSlot
                  key={i}
                  label={`${item} — Photo`}
                  desc={`Show the installed/replaced ${item}`}
                  icon="📦"
                  preview={previews[`item_${i}`]}
                  onOpen={() => setActiveCamera(`item_${i}`)}
                />
              ))}

              {/* Progress summary */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, marginTop: 4 }}>
                {[
                  { key: 'before', label: 'Before' },
                  { key: 'after', label: 'After' },
                  ...selectedItems.map((item, i) => ({ key: `item_${i}`, label: item }))
                ].map(slot => (
                  <span key={slot.key} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                    background: photos[slot.key] ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.1)',
                    color: photos[slot.key] ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${photos[slot.key] ? 'var(--green)' : 'var(--red)'}`,
                  }}>
                    {photos[slot.key] ? '✓' : '○'} {slot.label}
                  </span>
                ))}
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Remarks (optional)</label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Any notes…" />
              </div>

              {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => { setStep(1); setError('') }} disabled={submitting}>← Back</button>
                <button className="btn btn-primary" style={{
                  flex: 1, padding: 12, fontSize: 14,
                  opacity: readyToSubmit ? 1 : 0.6
                }} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '⏳ Submitting…' : `✅ Submit Proof & Mark Done`}
                </button>
              </div>
              {!readyToSubmit && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--yellow)', textAlign: 'center' }}>
                  ⚠️ All {2 + selectedItems.length} photos required before submitting
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                Submitting will mark your attendance as Present today.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
