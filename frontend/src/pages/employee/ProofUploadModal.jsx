import { useState, useRef, useEffect } from 'react'
import api from '../../api/axios'
import SignaturePad from '../../components/SignaturePad'

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

    const now = new Date(), W = canvas.width, H = canvas.height
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
      borderRadius: 10, padding: 10, marginBottom: 8,
      background: preview ? 'rgba(52,211,153,.05)' : 'var(--surface2)',
      display: 'flex', alignItems: 'center', gap: 10
    }}>
      {preview ? (
        <img src={preview} alt={label} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 60, height: 60, background: 'var(--surface)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>{desc}</div>
        <button onClick={onOpen} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
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
  const [step, setStep] = useState(1)
  const [selectedItems, setSelectedItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [activeCat, setActiveCat] = useState(null) // null = not chosen yet
  const [gps, setGps] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(true)

  // photos keyed as: before_0, after_0, photo_0, before_1, after_1, photo_1, ...
  const [photos, setPhotos] = useState({})
  const [previews, setPreviews] = useState({})
  const [activeCamera, setActiveCamera] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [extraPhotos, setExtraPhotos]   = useState([])    // [{file, preview, label}]
  const [extraLabels, setExtraLabels]   = useState([])    // editable label per extra photo

  // Step 3 — service report fields
  const [lastReportId,      setLastReportId]      = useState(null)
  const [reportNo,          setReportNo]          = useState('')
  const [complaintNo,       setComplaintNo]       = useState('')
  const [unitType,          setUnitType]          = useState('AMC')
  const [problemDesc,       setProblemDesc]       = useState('')
  const [observation,       setObservation]       = useState('')
  const [actionTaken,       setActionTaken]       = useState('')
  const [sparesRequired,    setSparesRequired]    = useState('')
  const [plantCapacity,     setPlantCapacity]     = useState('')
  const [designRwTds,       setDesignRwTds]       = useState('')
  const [freeChlorine,      setFreeChlorine]      = useState('')
  const [hoursRunning,      setHoursRunning]      = useState('')
  const [membraneCond,      setMembraneCond]      = useState('OK')
  const [uvLampCond,        setUvLampCond]        = useState('OK')
  const [sensorsCond,       setSensorsCond]       = useState('OK')
  const [prefilterCond,     setPrefilterCond]     = useState('OK')
  const [tdsInput,          setTdsInput]          = useState('')
  const [tdsOutput,         setTdsOutput]         = useState('')
  const [voltage,           setVoltage]           = useState('')
  const [flowRate,          setFlowRate]          = useState('')
  const [currentAmps,       setCurrentAmps]       = useState('')
  const [principalName,     setPrincipalName]     = useState('')
  const [customerMobile,    setCustomerMobile]    = useState('')
  const [customerRemarks,   setCustomerRemarks]   = useState('')
  const [status,            setStatus]            = useState('PROBLEM RESOLVED')
  const [techSig,           setTechSig]           = useState(null)
  const [principalSig,      setPrincipalSig]      = useState(null)
  const [srSubmitting,      setSrSubmitting]      = useState(false)
  const [pdfUrl,            setPdfUrl]            = useState(null)

  const CAT_A = '50/100 LPH RO Units'
  const CAT_B = '1000/1500/2000 LPH RO Units'

  useEffect(() => {
    captureGPS()
    api.get('/api/stock/').then(r => {
      // Store full objects so we can filter by category
      setStockItems(r.data || [])
    }).catch(() => {
      setStockItems([])
    })
  }, [])

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
    if (key.startsWith('extra_')) {
      const idx = parseInt(key.split('_')[1])
      setExtraPhotos(p => p.map((ep, i) => i === idx ? { ...ep, file, preview: previewUrl } : ep))
    } else {
      setPhotos(p => ({ ...p, [key]: file }))
      setPreviews(p => ({ ...p, [key]: previewUrl }))
    }
    setActiveCamera(null)
  }

  function proceedToPhotos() {
    if (selectedItems.length === 0) { setError('Please select at least one item.'); return }
    setError(''); setStep(2)
  }

  // For each item i, we need: before_i, after_i, photo_i
  const allPhotosDone = selectedItems.length > 0 && selectedItems.every((_, i) =>
    photos[`before_${i}`] && photos[`after_${i}`] && photos[`photo_${i}`]
  )
  const totalPhotos = selectedItems.length * 3

  async function handleSubmit() {
    const missing = selectedItems.find((item, i) =>
      !photos[`before_${i}`] || !photos[`after_${i}`] || !photos[`photo_${i}`]
    )
    if (missing) { setError(`Complete all 3 photos for: ${missing}`); return }

    setSubmitting(true); setError('Waking up server… please wait up to 30s')
    try {
      // Ping the backend first — Render free tier sleeps after 15 min inactivity
      // This wakes it up before we send the heavy multipart upload
      try { await api.get('/api/tasks/my-tasks', { timeout: 30000 }) } catch (_) {}

      setError('')
      const fd = new FormData()
      fd.append('task_id', task.id)
      fd.append('item_installed', selectedItems.join(', '))
      fd.append('remarks', remarks)
      if (gps) { fd.append('latitude', gps.lat); fd.append('longitude', gps.lng) }

      // Send as before_0/after_0/item_0 … before_N/after_N/item_N
      selectedItems.forEach((_, i) => {
        if (photos[`before_${i}`]) fd.append(`before_photo_${i}`, photos[`before_${i}`])
        if (photos[`after_${i}`])  fd.append(`after_photo_${i}`,  photos[`after_${i}`])
        if (photos[`photo_${i}`])  fd.append(`item_photo_${i}`,   photos[`photo_${i}`])
      })
      // Extra photos (up to 5)
      extraPhotos.slice(0, 5).forEach((ep, i) => {
        if (ep.file) fd.append(`extra_photo_${i}`, ep.file)
      })

      // 90 second timeout — large photo upload on mobile needs time
      const res = await api.post('/api/field-reports/submit', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90000
      })
      setLastReportId(res.data?.id || null)
      setStep(3)
    } catch (e) {
      const status = e.response?.status
      const detail = e.response?.data?.detail || e.response?.data?.message || e.message
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        setError('Upload timed out — your connection may be slow. Please try again.')
      } else {
        setError(`Submission failed (${status || 'network error'}): ${detail || 'Check your connection and try again.'}`)
      }
    }
    setSubmitting(false)
  }

  async function handleServiceReport() {
    setSrSubmitting(true)
    try {
      const res = await api.post('/api/service-reports/', {
        field_report_id:          lastReportId,
        task_id:                  task.id,
        school_id:                task.school_id,
        report_no:                reportNo,
        complaint_no:             complaintNo,
        unit_type:                unitType,
        problem_description:      problemDesc,
        observation,
        action_taken:             actionTaken,
        spare_parts:              sparesRequired || selectedItems.join(', '),
        plant_capacity:           plantCapacity,
        design_rw_tds:            designRwTds,
        free_chlorine_rw:         freeChlorine,
        hours_running:            hoursRunning,
        membrane_condition:       membraneCond,
        uv_lamp_condition:        uvLampCond,
        sensors_condition:        sensorsCond,
        prefilter_condition:      prefilterCond,
        tds_input:  tdsInput  ? Number(tdsInput)  : null,
        tds_output: tdsOutput ? Number(tdsOutput) : null,
        voltage:    voltage   ? Number(voltage)   : null,
        flow_rate:  flowRate  ? Number(flowRate)  : null,
        current_amps:             currentAmps,
        principal_name:           principalName,
        customer_mobile:          customerMobile,
        customer_remarks:         customerRemarks,
        status,
        technician_signature_b64: techSig,
        principal_signature_b64:  principalSig,
      })
      setPdfUrl(res.data.pdf_url)
    } catch (e) {
      setError(e.response?.data?.detail || 'Service report failed. Try again.')
    }
    setSrSubmitting(false)
  }

  const doneCount = selectedItems.reduce((acc, _, i) =>
    acc + (photos[`before_${i}`] ? 1 : 0) + (photos[`after_${i}`] ? 1 : 0) + (photos[`photo_${i}`] ? 1 : 0), 0
  )

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
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{task.title}</div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['1. Select Items', '2. Take Photos', '3. Service Report'].map((label, i) => {
              const active = step === i + 1, done = step > i + 1
              return (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                  background: active ? 'rgba(56,189,248,.15)' : done ? 'rgba(52,211,153,.15)' : 'var(--surface2)',
                  color: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--muted)',
                  border: `1.5px solid ${active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--border)'}`
                }}>
                  {done ? '✅ ' : ''}{label}
                </div>
              )
            })}
          </div>

          {/* GPS bar */}
          <div style={{
            padding: '7px 12px', borderRadius: 8, marginBottom: 12, fontSize: 11,
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
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                What did you install / replace / service?
              </div>

              {/* Category picker */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[CAT_A, CAT_B].map(cat => {
                  const shortLabel = cat === CAT_A ? '🔵 50 / 100 LPH RO' : '🟢 1000 – 2000 LPH RO'
                  const active = activeCat === cat
                  return (
                    <button key={cat} onClick={() => setActiveCat(cat)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `2px solid ${active ? (cat === CAT_A ? 'var(--accent)' : 'var(--green)') : 'var(--border)'}`,
                      background: active ? (cat === CAT_A ? 'rgba(56,189,248,.15)' : 'rgba(52,211,153,.15)') : 'var(--surface2)',
                      color: active ? (cat === CAT_A ? 'var(--accent)' : 'var(--green)') : 'var(--muted)',
                      textAlign: 'center', lineHeight: 1.4
                    }}>
                      {shortLabel}
                      <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, color: 'inherit', opacity: 0.8 }}>
                        {stockItems.filter(s => s.category === cat).length} items
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Items for selected category */}
              {!activeCat ? (
                <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--muted)', fontSize: 12 }}>
                  ☝️ Select your RO unit type above to see the parts list
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14, maxHeight: 220, overflowY: 'auto', padding: '2px 0' }}>
                  {stockItems
                    .filter(s => s.category === activeCat)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(item => {
                      const sel = selectedItems.includes(item.name)
                      return (
                        <button key={item.id} onClick={() => toggleItem(item.name)} style={{
                          padding: '6px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${sel ? (activeCat === CAT_A ? 'var(--accent)' : 'var(--green)') : 'var(--border)'}`,
                          background: sel ? (activeCat === CAT_A ? 'rgba(56,189,248,.15)' : 'rgba(52,211,153,.15)') : 'var(--surface2)',
                          color: sel ? (activeCat === CAT_A ? 'var(--accent)' : 'var(--green)') : 'var(--text)',
                        }}>
                          {sel ? '✓ ' : ''}{item.name}
                        </button>
                      )
                    })
                  }
                </div>
              )}

              {selectedItems.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(56,189,248,.08)', border: '1px solid var(--accent)', fontSize: 12, marginBottom: 12 }}>
                  <b style={{ color: 'var(--accent)' }}>Selected ({selectedItems.length}):</b>{' '}
                  {selectedItems.join(' · ')}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    📷 Each item needs: Before + After + Item photo → <b>{totalPhotos} photos total</b>
                  </div>
                </div>
              )}

              {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}

              <button className="btn btn-primary" style={{ width: '100%', padding: 12, fontSize: 13 }} onClick={proceedToPhotos}>
                Next — Take Photos ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} → {totalPhotos} photos) →
              </button>
            </>
          )}

          {/* ── STEP 2: Take photos per item ── */}
          {step === 2 && (
            <>
              {/* Overall progress bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PHOTO PROGRESS</span>
                  <span style={{ color: doneCount === totalPhotos ? 'var(--green)' : 'var(--accent)', fontWeight: 700 }}>
                    {doneCount} / {totalPhotos} done
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${totalPhotos ? (doneCount / totalPhotos) * 100 : 0}%`, background: doneCount === totalPhotos ? 'var(--green)' : 'var(--accent)', borderRadius: 3, transition: 'width .3s' }} />
                </div>
              </div>

              {/* Per-item photo groups */}
              {selectedItems.map((item, i) => {
                const itemDone = photos[`before_${i}`] && photos[`after_${i}`] && photos[`photo_${i}`]
                return (
                  <div key={i} style={{
                    border: `1.5px solid ${itemDone ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 12, padding: 12, marginBottom: 12,
                    background: itemDone ? 'rgba(52,211,153,.04)' : 'var(--surface)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 10,
                        background: itemDone ? 'rgba(52,211,153,.2)' : 'rgba(56,189,248,.15)',
                        color: itemDone ? 'var(--green)' : 'var(--accent)',
                        border: `1px solid ${itemDone ? 'var(--green)' : 'var(--accent)'}`
                      }}>
                        {itemDone ? '✅' : `#${i + 1}`}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{item}</span>
                    </div>

                    <PhotoSlot
                      label="Before"
                      desc={`Before installing/replacing ${item}`}
                      icon="📷"
                      preview={previews[`before_${i}`]}
                      onOpen={() => setActiveCamera(`before_${i}`)}
                    />
                    <PhotoSlot
                      label="After"
                      desc={`After installing/replacing ${item}`}
                      icon="✅"
                      preview={previews[`after_${i}`]}
                      onOpen={() => setActiveCamera(`after_${i}`)}
                    />
                    <PhotoSlot
                      label={`${item} — Close-up`}
                      desc={`Show the ${item} installed`}
                      icon="📦"
                      preview={previews[`photo_${i}`]}
                      onOpen={() => setActiveCamera(`photo_${i}`)}
                    />
                  </div>
                )
              })}

              {/* Extra photos */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    📎 Extra Photos <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
                  </div>
                  {extraPhotos.length < 5 && (
                    <button
                      onClick={() => {
                        setExtraPhotos(p => [...p, { file: null, preview: null }])
                        setExtraLabels(l => [...l, ''])
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8,
                        fontSize: 12, fontWeight: 700, background: 'rgba(56,189,248,.15)', color: 'var(--accent)',
                        border: '1.5px dashed var(--accent)', cursor: 'pointer' }}>
                      + Add Extra Photo
                    </button>
                  )}
                </div>
                {extraPhotos.map((ep, i) => (
                  <div key={i} style={{
                    border: `2px dashed ${ep.preview ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 10, padding: 10, marginBottom: 8,
                    background: ep.preview ? 'rgba(52,211,153,.05)' : 'var(--surface2)',
                    display: 'flex', alignItems: 'center', gap: 10
                  }}>
                    {ep.preview ? (
                      <img src={ep.preview} alt={`extra_${i}`}
                        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 60, height: 60, background: 'var(--surface)', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                        📷
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <input
                        value={extraLabels[i] || ''}
                        onChange={e => setExtraLabels(l => l.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`Label (e.g. Water quality meter)`}
                        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 5, fontSize: 11,
                          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                          padding: '4px 8px', color: 'var(--text)' }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setActiveCamera(`extra_${i}`)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
                          fontSize: 11, fontWeight: 600, background: ep.preview ? 'var(--green)' : 'var(--accent)',
                          color: '#fff', border: 'none', cursor: 'pointer' }}>
                          📷 {ep.preview ? 'Retake' : 'Open Camera'}
                        </button>
                        <button onClick={() => {
                          setExtraPhotos(p => p.filter((_, j) => j !== i))
                          setExtraLabels(l => l.filter((_, j) => j !== i))
                        }} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11,
                          background: 'rgba(248,113,113,.15)', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer' }}>
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Remarks (optional)</label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Any notes…" />
              </div>

              {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => { setStep(1); setError('') }} disabled={submitting}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 13, opacity: allPhotosDone ? 1 : 0.6 }}
                  onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '⏳ Uploading… please wait' : '✅ Submit Proof & Mark Done'}
                </button>
              </div>
              {!allPhotosDone && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'var(--yellow)', textAlign: 'center' }}>
                  ⚠️ All {totalPhotos} photos required before submitting
                </div>
              )}
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                Photos submitted! Now fill the service report in Step 3.
              </div>
            </>
          )}

          {/* ── STEP 3: Service report + signatures ── */}
          {step === 3 && (
            <>
              {pdfUrl ? (
                /* ── Success: PDF ready ── */
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Service Report Generated!</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>PDF is ready with signatures and school stamp.</div>
                  <a href={pdfUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', marginBottom: 12 }}>
                    📄 Download PDF
                  </a>
                  <br />
                  <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={onSubmitted}>Close</button>
                </div>
              ) : (
                <>
                  {/* ── Section label helper ── */}
                  {/* Report Meta */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(56,189,248,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    📋 Report Info
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Report No</label>
                      <input value={reportNo} onChange={e => setReportNo(e.target.value)} placeholder="e.g. SR-001" style={{ fontSize: 12 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Complaint No</label>
                      <input value={complaintNo} onChange={e => setComplaintNo(e.target.value)} placeholder="e.g. CMP-001" style={{ fontSize: 12 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Unit Type</label>
                      <select value={unitType} onChange={e => setUnitType(e.target.value)} style={{ fontSize: 12 }}>
                        <option>AMC</option><option>Warranty</option><option>Chargeable</option>
                      </select>
                    </div>
                  </div>

                  {/* Problem / Observation / Action */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(56,189,248,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    🔧 Work Details
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10 }}>Problem Reported</label>
                    <textarea value={problemDesc} onChange={e => setProblemDesc(e.target.value)} rows={2} placeholder="What was the problem?" style={{ fontSize: 12 }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10 }}>Observation &amp; Action Taken</label>
                    <textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2} placeholder="What was observed and done?" style={{ fontSize: 12 }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10 }}>Spares Required / Consumed</label>
                    <input value={sparesRequired} onChange={e => setSparesRequired(e.target.value)}
                      placeholder={selectedItems.join(', ') || 'e.g. Filter, Membrane'} style={{ fontSize: 12 }} />
                  </div>

                  {/* Unit Details / Site Condition */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(56,189,248,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    🏭 Unit Details / Site Condition
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {[
                      ['Plant Capacity',     plantCapacity,  setPlantCapacity,  'e.g. 1000 LPH'],
                      ['Design R/W TDS',     designRwTds,    setDesignRwTds,    'ppm'],
                      ['Free Chlorine R/W',  freeChlorine,   setFreeChlorine,   'mg/L'],
                      ['No. of Hours Running',hoursRunning,  setHoursRunning,   'hrs/day'],
                    ].map(([lbl, val, setter, ph]) => (
                      <div key={lbl} className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 10 }}>{lbl}</label>
                        <input value={val} onChange={e => setter(e.target.value)} placeholder={ph} style={{ fontSize: 12 }} />
                      </div>
                    ))}
                  </div>
                  {/* Condition dropdowns */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {[
                      ['Membrane Condition',  membraneCond,  setMembraneCond],
                      ['UV Lamp Condition',   uvLampCond,    setUvLampCond],
                      ['Sensors Condition',   sensorsCond,   setSensorsCond],
                      ['Pre-Filter Condition',prefilterCond, setPrefilterCond],
                    ].map(([lbl, val, setter]) => (
                      <div key={lbl} className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 10 }}>{lbl}</label>
                        <select value={val} onChange={e => setter(e.target.value)} style={{ fontSize: 12 }}>
                          <option>OK</option><option>Not OK</option><option>To be replaced</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Plant Readings */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(56,189,248,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    📊 Plant Readings
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {[
                      ['Raw Water TDS (ppm)',    tdsInput,    setTdsInput],
                      ['Product Water TDS (ppm)',tdsOutput,   setTdsOutput],
                      ['Flow Rate (LPH)',         flowRate,    setFlowRate],
                      ['Voltage (V)',             voltage,     setVoltage],
                      ['Current (Amps)',          currentAmps, setCurrentAmps],
                    ].map(([lbl, val, setter]) => (
                      <div key={lbl} className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 10 }}>{lbl}</label>
                        <input type="number" value={val} onChange={e => setter(e.target.value)} placeholder="—" style={{ fontSize: 12 }} />
                      </div>
                    ))}
                  </div>

                  {/* Status */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Status</label>
                      <select value={status} onChange={e => setStatus(e.target.value)} style={{ fontSize: 12, color: status.includes('UNRESOLVED') ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                        <option value="PROBLEM RESOLVED">✅ PROBLEM RESOLVED</option>
                        <option value="PROBLEM UNRESOLVED">❌ PROBLEM UNRESOLVED</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Customer Remarks</label>
                      <input value={customerRemarks} onChange={e => setCustomerRemarks(e.target.value)} placeholder="Any feedback" style={{ fontSize: 12 }} />
                    </div>
                  </div>

                  {/* Customer info */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(56,189,248,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    🧑‍💼 Customer / Principal
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Principal / In-charge Name</label>
                      <input value={principalName} onChange={e => setPrincipalName(e.target.value)} placeholder="Name" style={{ fontSize: 12 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Mobile Number</label>
                      <input value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder="10-digit mobile" style={{ fontSize: 12 }} />
                    </div>
                  </div>

                  {/* Signatures */}
                  <SignaturePad label="Your Signature (Service Engineer)" onSigned={setTechSig} style={{ marginBottom: 14 }} />

                  <div style={{ padding: 12, borderRadius: 10, border: '2px solid var(--yellow)', background: 'rgba(251,191,36,.06)', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', marginBottom: 8 }}>
                      📱 Hand phone to Customer / Principal for signature
                    </div>
                    <SignaturePad label="Customer Signature" onSigned={setPrincipalSig} />
                  </div>

                  {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={onSubmitted} disabled={srSubmitting}>
                      Skip — Close
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }}
                      onClick={handleServiceReport} disabled={srSubmitting || !techSig || !principalSig}>
                      {srSubmitting ? '⏳ Generating PDF…' : '✅ Generate Service Report PDF'}
                    </button>
                  </div>
                  {(!techSig || !principalSig) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--yellow)', textAlign: 'center' }}>
                      ⚠️ Both signatures required before generating PDF
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
