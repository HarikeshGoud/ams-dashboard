import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import SignaturePad from '../../components/SignaturePad'
import CameraCapture from '../../components/CameraCapture'
import SearchableSelect from '../../components/SearchableSelect'

function batchLabel(b) {
  return `${b.batch_no} — ${b.qty_office} left (received ${b.received_date})`
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
  const resumeStep3 = task?._resumeStep3 === true
  const [step, setStep] = useState(resumeStep3 ? 3 : 1)
  const [selectedItems, setSelectedItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [myStock, setMyStock]       = useState([])  // technician's in-hand items
  const [installDetails, setInstallDetails] = useState({}) // { [selectedItems index]: { quantity, batch_id } }
  const [itemBatches, setItemBatches] = useState({}) // { [item_id]: batches[] the technician holds }
  const [stockDeducted, setStockDeducted] = useState([]) // items auto-deducted on submit
  const [stockFailed, setStockFailed] = useState([]) // items that had a batch picked but the deduction call failed
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
  const [lastReportId,      setLastReportId]      = useState(resumeStep3 ? (task?._fieldReportId ?? null) : null)
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

  // Block browser back/refresh when on Step 3 and PDF not yet generated
  useEffect(() => {
    if (step !== 3 || pdfUrl) return
    // Push a dummy history state so back button hits it first
    window.history.pushState({ srLock: true }, '')
    const onPop = (e) => {
      // Re-push so back button always gets intercepted
      window.history.pushState({ srLock: true }, '')
    }
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = 'Service report not completed! Your proof is saved but the service report PDF is required.'
      return e.returnValue
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [step, pdfUrl])

  useEffect(() => {
    captureGPS()
    Promise.all([
      api.get('/api/stock/'),
      api.get('/api/stock/my-stock'),
    ]).then(([catalog, ms]) => {
      setStockItems(catalog.data || [])
      setMyStock(ms.data?.in_hand || [])
    }).catch(() => { setStockItems([]); setMyStock([]) })
  }, [])

  // Fetch the batches the technician actually holds for each selected item they have in hand
  useEffect(() => {
    selectedItems.forEach((item, i) => {
      const held = myStock.find(m => m.item_id === item.id)
      if (held && !(item.id in itemBatches)) {
        api.get('/api/stock/employee-batches', { params: { item_id: item.id } })
          .then(r => {
            setItemBatches(prev => ({ ...prev, [item.id]: r.data }))
            if (r.data.length === 1) {
              setInstallDetails(prev => ({ ...prev, [i]: { ...prev[i], batch_id: String(r.data[0].id) } }))
            }
          })
          .catch(() => setItemBatches(prev => ({ ...prev, [item.id]: [] })))
      }
    })
  }, [selectedItems, myStock])

  function captureGPS() {
    setGpsLoading(true); setGpsError('')
    if (!navigator.geolocation) { setGpsError('GPS not supported.'); setGpsLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGpsLoading(false) },
      err => { setGpsError(`GPS failed: ${err.message}`); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  // selectedItems stores {id, name} objects — matched by exact item.id
  function toggleItem(item) {
    setSelectedItems(prev =>
      prev.some(i => i.id === item.id)
        ? prev.filter(i => i.id !== item.id)
        : [...prev, { id: item.id, name: item.name }]
    )
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

  const selectedNames = selectedItems.map(i => i.name)

  // For each item i, we need: before_i, after_i, photo_i
  const allPhotosDone = selectedItems.length > 0 && selectedItems.every((_, i) =>
    photos[`before_${i}`] && photos[`after_${i}`] && photos[`photo_${i}`]
  )
  const totalPhotos = selectedItems.length * 3

  async function handleSubmit() {
    if (!gps) {
      setError('GPS location is required before submitting — wait for "GPS locked" above, or tap Retry.')
      return
    }
    const missing = selectedItems.find((item, i) =>
      !photos[`before_${i}`] || !photos[`after_${i}`] || !photos[`photo_${i}`]
    )
    if (missing) { setError(`Complete all 3 photos for: ${missing.name}`); return }

    setSubmitting(true)

    const buildFormData = () => {
      const fd = new FormData()
      fd.append('task_id', task.id)
      fd.append('item_installed', selectedNames.join(', '))
      fd.append('remarks', remarks)
      if (gps) { fd.append('latitude', gps.lat); fd.append('longitude', gps.lng) }
      selectedItems.forEach((_, i) => {
        if (photos[`before_${i}`]) fd.append(`before_photo_${i}`, photos[`before_${i}`])
        if (photos[`after_${i}`])  fd.append(`after_photo_${i}`,  photos[`after_${i}`])
        if (photos[`photo_${i}`])  fd.append(`item_photo_${i}`,   photos[`photo_${i}`])
      })
      extraPhotos.slice(0, 5).forEach((ep, i) => {
        if (ep.file) fd.append(`extra_photo_${i}`, ep.file)
      })
      return fd
    }

    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setError(attempt === 1 ? 'Uploading… please wait' : `Retrying (attempt ${attempt}/3)…`)
        // Wake-up ping on first attempt only
        if (attempt === 1) {
          try { await api.get('/api/tasks/my-tasks', { timeout: 35000 }) } catch (_) {}
        }
        const res = await api.post('/api/field-reports/submit', buildFormData(), {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000
        })
        setLastReportId(res.data?.id || null)
        setError('')

        // Auto-deduct stock: match by exact item_id, using the technician's chosen quantity + batch
        const deducted = []
        const failed = []
        for (let i = 0; i < selectedItems.length; i++) {
          const selItem = selectedItems[i]
          const inHand = myStock.find(s => s.item_id === selItem.id)
          const details = installDetails[i]
          const qty = (details?.quantity === undefined || details.quantity === '') ? 1 : parseInt(details.quantity)
          if (inHand && inHand.qty_in_hand > 0 && details?.batch_id && qty > 0) {
            try {
              await api.post('/api/stock/install', {
                item_id: inHand.item_id,
                batch_id: parseInt(details.batch_id),
                quantity: qty,
                school_dest: task.school_name || null,
                note: `Auto-deducted on proof submission for ${task.title}`
              })
              deducted.push(`${selItem.name} (${qty} ${inHand.unit})`)
            } catch (e) {
              failed.push(`${selItem.name}: ${e.response?.data?.detail || 'could not update stock'}`)
            }
          }
        }
        setStockDeducted(deducted)
        setStockFailed(failed)
        setStep(3)
        setSubmitting(false)
        return
      } catch (e) {
        lastErr = e
        if (e.response?.status) break  // server error — no point retrying
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000))
      }
    }

    const status = lastErr?.response?.status
    const detail = lastErr?.response?.data?.detail || lastErr?.response?.data?.message || lastErr?.message
    if (lastErr?.code === 'ECONNABORTED' || lastErr?.message?.includes('timeout')) {
      setError('Upload timed out — connection too slow. Please try on WiFi.')
    } else {
      setError(`Submission failed (${status || 'network error'}): ${detail || 'Check your connection and try again.'}`)
    }
    setSubmitting(false)
  }

  async function handleServiceReport() {
    // Validate all required fields
    const missing = []
    if (!reportNo.trim())        missing.push('Report No')
    if (!complaintNo.trim())     missing.push('Complaint No')
    if (!problemDesc.trim())     missing.push('Problem Reported')
    if (!observation.trim())     missing.push('Observation & Action Taken')
    if (!sparesRequired.trim() && selectedNames.length === 0) missing.push('Spares Required / Consumed')
    if (!plantCapacity.trim())   missing.push('Plant Capacity')
    if (!designRwTds.trim())     missing.push('Design R/W TDS')
    if (!freeChlorine.trim())    missing.push('Free Chlorine R/W')
    if (!hoursRunning.trim())    missing.push('No. of Hours Running')
    if (!tdsInput)               missing.push('Raw Water TDS')
    if (!tdsOutput)              missing.push('Product Water TDS')
    if (!flowRate)               missing.push('Flow Rate')
    if (!voltage)                missing.push('Voltage')
    if (!currentAmps.trim())     missing.push('Current (Amps)')
    if (!principalName.trim())   missing.push('Principal / In-charge Name')
    if (!customerMobile.trim())  missing.push('Mobile Number')
    if (!techSig)                missing.push('Your Signature')
    if (!principalSig)           missing.push('Customer Signature')
    if (missing.length > 0) {
      setError(`Please fill all required fields: ${missing.join(', ')}`)
      return
    }
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
        spare_parts:              sparesRequired || selectedNames.join(', '),
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
          siteName={task?.school_name}
          onCapture={(file, url) => handleCaptured(activeCamera, file, url)}
          onClose={() => setActiveCamera(null)}
        />
      )}

      <div className="modal-backdrop">
        <div className="modal-box" style={{ maxWidth: 500 }}>
          {/* Hide close button on Step 3 until PDF is generated — service report is mandatory */}
          {(step !== 3 || pdfUrl) && (
            <button className="modal-close" onClick={onClose}>✕</button>
          )}
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
                    .sort((a, b) => {
                      // Sort: in-hand items first (exact item_id match)
                      const aInHand = myStock.some(m => m.item_id === a.id)
                      const bInHand = myStock.some(m => m.item_id === b.id)
                      if (aInHand && !bInHand) return -1
                      if (!aInHand && bInHand) return 1
                      return a.name.localeCompare(b.name)
                    })
                    .map(item => {
                      const sel = selectedItems.some(i => i.id === item.id)
                      const inHandEntry = myStock.find(m => m.item_id === item.id)
                      return (
                        <button key={item.id} onClick={() => toggleItem(item)} style={{
                          padding: '6px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${sel ? (activeCat === CAT_A ? 'var(--accent)' : 'var(--green)') : inHandEntry ? 'var(--yellow)' : 'var(--border)'}`,
                          background: sel ? (activeCat === CAT_A ? 'rgba(56,189,248,.15)' : 'rgba(52,211,153,.15)') : inHandEntry ? 'rgba(251,191,36,.1)' : 'var(--surface2)',
                          color: sel ? (activeCat === CAT_A ? 'var(--accent)' : 'var(--green)') : inHandEntry ? 'var(--yellow)' : 'var(--text)',
                          position: 'relative'
                        }}>
                          {sel ? '✓ ' : ''}{item.name}
                          {inHandEntry && (
                            <span style={{ marginLeft: 5, fontSize: 9, background: 'var(--yellow)', color: '#000', borderRadius: 8, padding: '1px 5px', fontWeight: 800 }}>
                              🎒{inHandEntry.qty_in_hand}
                            </span>
                          )}
                        </button>
                      )
                    })
                  }
                </div>
              )}

{selectedItems.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(56,189,248,.08)', border: '1px solid var(--accent)', fontSize: 12, marginBottom: 12 }}>
                  <b style={{ color: 'var(--accent)' }}>Selected ({selectedItems.length}):</b>{' '}
                  {selectedNames.join(' · ')}
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
                const inHandEntry = myStock.find(m => m.item_id === item.id)
                const batches = itemBatches[item.id] || []
                const details = installDetails[i] || {}
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
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</span>
                    </div>

                    {inHandEntry && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <label style={{ fontSize: 10 }}>Qty Used</label>
                          <input type="number" min="1" max={inHandEntry.qty_in_hand} value={details.quantity ?? 1}
                            onChange={e => setInstallDetails(prev => ({ ...prev, [i]: { ...prev[i], quantity: e.target.value } }))}
                            style={{ fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                          <label style={{ fontSize: 10 }}>From Batch {batches.length > 0 ? '(so stock stays traceable)' : ''}</label>
                          {batches.length === 1 ? (
                            <div style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 11, color: 'var(--muted)' }}>
                              {batchLabel(batches[0])}
                            </div>
                          ) : (
                            <SearchableSelect value={details.batch_id ?? ''}
                              onChange={val => setInstallDetails(prev => ({ ...prev, [i]: { ...prev[i], batch_id: val } }))}
                              placeholder={batches.length ? 'Select batch…' : 'No batch in hand'}
                              options={batches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
                          )}
                        </div>
                      </div>
                    )}

                    <PhotoSlot
                      label="Before"
                      desc={`Before installing/replacing ${item.name}`}
                      icon="📷"
                      preview={previews[`before_${i}`]}
                      onOpen={() => setActiveCamera(`before_${i}`)}
                    />
                    <PhotoSlot
                      label="After"
                      desc={`After installing/replacing ${item.name}`}
                      icon="✅"
                      preview={previews[`after_${i}`]}
                      onOpen={() => setActiveCamera(`after_${i}`)}
                    />
                    <PhotoSlot
                      label={`${item.name} — Close-up`}
                      desc={`Show the ${item.name} installed`}
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
                <button className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 13, opacity: (allPhotosDone && gps) ? 1 : 0.6 }}
                  onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '⏳ Uploading… please wait' : '✅ Submit Proof & Mark Done'}
                </button>
              </div>
              {!gps && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
                  ⚠️ GPS must be locked before submitting
                </div>
              )}
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
              {/* Mandatory notice */}
              {!pdfUrl && (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                  🔒 Service report is mandatory — fill all fields and get signatures to complete this task.
                </div>
              )}
              {/* Stock auto-deduction notice */}
              {stockDeducted.length > 0 && (
                <div style={{ background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>🎒 Stock Updated Automatically</div>
                  <div style={{ color: 'var(--text)' }}>The following items were deducted from your stock:</div>
                  {stockDeducted.map((s, i) => <div key={i} style={{ color: 'var(--green)', fontWeight: 600, fontSize: 11, marginTop: 2 }}>✓ {s}</div>)}
                </div>
              )}
              {stockFailed.length > 0 && (
                <div style={{ background: 'rgba(251,191,36,.1)', border: '1px solid var(--yellow)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 4 }}>⚠️ Stock Not Updated</div>
                  <div style={{ color: 'var(--text)' }}>These items weren't deducted — sort them out with admin/deskwork manually:</div>
                  {stockFailed.map((s, i) => <div key={i} style={{ color: 'var(--yellow)', fontWeight: 600, fontSize: 11, marginTop: 2 }}>✗ {s}</div>)}
                </div>
              )}

              {pdfUrl ? (
                /* ── Success: PDF ready ── */
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Service Report Generated!</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>PDF is ready with signatures.</div>
                  <div style={{ fontSize: 11, color: 'var(--yellow)', background: 'rgba(251,191,36,.1)', border: '1px solid var(--yellow)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'left' }}>
                    🔖 The official site stamp and serial number will be added automatically once your proof is verified by admin/deskwork.
                  </div>
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
                  <div className="grid-3" style={{ gap: 8, marginBottom: 10 }}>
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
                      placeholder={selectedNames.join(', ') || 'e.g. Filter, Membrane'} style={{ fontSize: 12 }} />
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
                      <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#22c55e', cursor: 'pointer' }}>
                          <input type="radio" name="status" value="PROBLEM RESOLVED" checked={status === 'PROBLEM RESOLVED'} onChange={e => setStatus(e.target.value)} />
                          ✅ RESOLVED
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#ef4444', cursor: 'pointer' }}>
                          <input type="radio" name="status" value="PROBLEM UNRESOLVED" checked={status === 'PROBLEM UNRESOLVED'} onChange={e => setStatus(e.target.value)} />
                          ❌ UNRESOLVED
                        </label>
                      </div>
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
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }}
                      onClick={handleServiceReport} disabled={srSubmitting}>
                      {srSubmitting ? '⏳ Generating PDF…' : '✅ Generate Service Report PDF'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--yellow)', textAlign: 'center' }}>
                    ⚠️ All fields + both signatures required before generating PDF
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
