import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import SignaturePad from '../../components/SignaturePad'
import CameraCapture from '../../components/CameraCapture'
import SearchableSelect from '../../components/SearchableSelect'
import { useAuthStore } from '../../store/authStore'

// The login payload carries the technician's name but not their phone, and no technician has a
// number on their employee record, so the number is remembered here after the first report
// rather than retyped on every visit.
const TECH_MOBILE_KEY = 'shc_tech_mobile'

function batchLabel(b) {
  return `${b.batch_no} — ${b.qty_office} left (received ${b.received_date})`
}

// Servicing / cleaning visits replace nothing, so there is no per-part Before/After/Close-up
// set to build the photo list from. These six fixed slots are the proof instead: they walk
// the plant end to end so a desk reviewer can see the work without knowing what was done.
// Extra photos stay available on top for anything these don't cover.
const SERVICE_SLOTS = [
  { key: 'service_before',    label: 'Before servicing',        desc: 'Whole plant as you found it',            icon: '📷' },
  { key: 'service_prefilter', label: 'Pre-filters / housings',  desc: 'Filter housings opened or cleaned',      icon: '🧴' },
  { key: 'service_membrane',  label: 'Membrane housing',        desc: 'Membrane housing / RO section',          icon: '🧪' },
  { key: 'service_pump',      label: 'Pump & electrical panel',  desc: 'Pump, panel, wiring you worked on',      icon: '⚡' },
  { key: 'service_tank',      label: 'Tank / outlet',           desc: 'Storage tank, taps or outlet plumbing',  icon: '🚰' },
  { key: 'service_after',     label: 'After servicing',         desc: 'Plant running, water flowing',           icon: '✅' },
]

// A "problem at site" visit is a report OF something, not a record of work done — the plant
// couldn't be serviced, a part is awaited, access was refused. So there is nothing to
// photograph in sequence and the single photo is offered rather than demanded: sometimes the
// problem isn't photographable (no power, gate locked) and blocking the report on a picture
// would just mean no report at all. The written report is what matters here, so unlike every
// other mode it is mandatory even at a site that is otherwise exempt.
const PROBLEM_SLOT = {
  key: 'problem_photo', label: 'Photo of the problem', icon: '⚠️',
  desc: 'Optional — add one if the problem can be seen',
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
  // Temples are exempt from the full service report — a daily clean doesn't warrant plant
  // readings, spares and two signatures every morning. The backend decides (tasks._fmt),
  // so this can't drift from what Proof Review and the dashboard think. Defaults to
  // required when the flag is absent, so an older payload never accidentally waives it.
  const reportRequired = task?.service_report_required !== false
  const [step, setStep] = useState(resumeStep3 ? 3 : 1)
  const [selectedItems, setSelectedItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [myStock, setMyStock]       = useState([])  // technician's in-hand items
  const [installDetails, setInstallDetails] = useState({}) // { [selectedItems index]: { quantity, batch_id } }
  const [itemBatches, setItemBatches] = useState({}) // { [item_id]: batches[] the technician holds }
  const [stockDeducted, setStockDeducted] = useState([]) // items auto-deducted on submit
  const [stockFailed, setStockFailed] = useState([]) // items that had a batch picked but the deduction call failed
  const [activeCat, setActiveCat] = useState(null) // null = not chosen yet
  // 'parts'   — something was installed/replaced, so photos are per selected part.
  // 'service' — cleaning / servicing / repair with NO parts replaced. There is no parts
  //             list to show, so this jumps straight to a fixed set of proof photos.
  // 'problem' — a problem is being reported, not work recorded. One optional photo, then the
  //             written report, which is mandatory here even where it normally isn't.
  const [proofMode, setProofMode] = useState('parts')
  // Declared here rather than beside isService/isProblem below, because the Step 3 lock effect
  // lists it in a dependency array and would hit a TDZ error on a later const.
  //
  // A problem report is mandatory even at a site normally exempt from reports. Temples are
  // waived because a daily clean doesn't warrant plant readings — but a visit where nothing
  // could be done is exactly the case that needs writing down, or it reads as an unexplained
  // no-show.
  const reportMandatory = reportRequired || proofMode === 'problem'
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
  // Who did the work, printed on the report beside the engineer signature. Pre-filled from the
  // logged-in profile; the number is remembered locally after the first time because no
  // technician has a phone on their employee record, so otherwise it would be retyped daily.
  const authUser = useAuthStore(s => s.user)
  const [techName,   setTechName]   = useState(() => authUser?.name || '')
  const [techMobile, setTechMobile] = useState(() => {
    try { return localStorage.getItem(TECH_MOBILE_KEY) || '' } catch { return '' }
  })
  const [customerRemarks,   setCustomerRemarks]   = useState('')
  const [status,            setStatus]            = useState('PROBLEM RESOLVED')
  const [techSig,           setTechSig]           = useState(null)
  const [principalSig,      setPrincipalSig]      = useState(null)
  // Photo of the stamped + signed + dated document — mandatory, captured live.
  const [stampPhoto,        setStampPhoto]        = useState(null)   // base64 for the report
  const [stampPreview,      setStampPreview]      = useState(null)
  const [srSubmitting,      setSrSubmitting]      = useState(false)
  const [pdfUrl,            setPdfUrl]            = useState(null)

  // CAT_A / CAT_B are the category values stored on the stock items, so they must match
  // the database exactly. `short` is only the button caption, which is why the smaller
  // units can be relabelled to cover 250 and 500 LPH without touching any stock records.
  const CAT_A = '50/100 LPH RO Units'
  const CAT_B = '1000/1500/2000 LPH RO Units'
  const CAT_META = {
    [CAT_A]: { icon: '🔵', short: '50/100/250/500 LPH RO', color: 'var(--accent)', bg: 'rgba(34,211,238,.15)' },
    [CAT_B]: { icon: '🟢', short: '1000 – 2000 LPH RO', color: 'var(--green)', bg: 'rgba(52,211,153,.15)' },
  }
  function catMeta(cat) {
    return CAT_META[cat] || { icon: '📦', short: cat, color: 'var(--purple)', bg: 'rgba(167,139,250,.15)' }
  }
  // Every category that actually has at least one item — not just the two RO-unit
  // categories — so parts like Fittings/Consumables/Membranes/Electrical/Pumps are
  // reachable here too, instead of only existing in the admin/deskwork stock view.
  const categories = [...new Set(stockItems.map(s => s.category).filter(Boolean))]
    .sort((a, b) => {
      if (a === CAT_A) return -1; if (b === CAT_A) return 1
      if (a === CAT_B) return -1; if (b === CAT_B) return 1
      return a.localeCompare(b)
    })

  // Block browser back/refresh when on Step 3 and PDF not yet generated.
  // Skipped where the report is optional (temples) — trapping someone in a form they are
  // not required to fill is the worst possible version of this lock.
  useEffect(() => {
    if (step !== 3 || pdfUrl || !reportMandatory) return
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
  }, [step, pdfUrl, reportMandatory])

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
    if (key === 'stamp') {
      // The service report is posted as JSON, so this one is kept as base64
      // alongside the signatures rather than uploaded as a file.
      const reader = new FileReader()
      reader.onload = () => setStampPhoto(reader.result)
      reader.readAsDataURL(file)
      setStampPreview(previewUrl)
      setActiveCamera(null)
      return
    }
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
    setProofMode('parts'); setError(''); setStep(2)
  }

  // Servicing / cleaning: no parts list to work through, so go straight to the photos.
  // Any parts picked before changing their mind are dropped, otherwise they'd be reported
  // as replaced and deducted from the technician's stock on submit.
  function startServiceProof() {
    setSelectedItems([])
    setInstallDetails({})
    setActiveCat(null)
    setProofMode('service')
    setError('')
    setStep(2)
  }

  // Reporting a problem instead of recording work. Same reset as servicing — any parts picked
  // before changing their mind must go, or they'd be reported as replaced and deducted.
  function startProblemProof() {
    setSelectedItems([])
    setInstallDetails({})
    setActiveCat(null)
    setProofMode('problem')
    setError('')
    setStep(2)
  }

  // Going back to pick parts must leave service mode, or the parts list would be rendered
  // while the photo checks still expect the six servicing slots.
  function backToItems() {
    setProofMode('parts'); setError(''); setStep(1)
  }

  const isService = proofMode === 'service'
  const isProblem = proofMode === 'problem'
  const selectedNames = selectedItems.map(i => i.name)
  // What goes in the report's "item installed" line. A servicing visit replaced nothing, and
  // leaving this blank would make the proof read as an unexplained visit in Proof Review.
  const SERVICE_LABEL = 'Servicing / cleaning — no parts replaced'
  const PROBLEM_LABEL = 'Problem reported at site — no work completed'

  // parts mode: for each item i we need before_i, after_i, photo_i.
  // service mode: the six fixed slots above.
  // problem mode: nothing is required — the one photo is optional by design.
  const allPhotosDone = isProblem
    ? true
    : isService
      ? SERVICE_SLOTS.every(s => photos[s.key])
      : selectedItems.length > 0 && selectedItems.every((_, i) =>
          photos[`before_${i}`] && photos[`after_${i}`] && photos[`photo_${i}`]
        )
  const totalPhotos = isProblem ? 1 : isService ? SERVICE_SLOTS.length : selectedItems.length * 3

  async function handleSubmit() {
    if (!gps) {
      setError('GPS location is required before submitting — wait for "GPS locked" above, or tap Retry.')
      return
    }
    if (isProblem) {
      // Nothing to check — the photo is optional and the written report is where the
      // substance lives. Deliberately no "are you sure" either; the report step follows.
    } else if (isService) {
      const gap = SERVICE_SLOTS.filter(s => !photos[s.key])
      if (gap.length) {
        setError(`${gap.length} photo(s) still needed: ${gap.map(s => s.label).join(', ')}`)
        return
      }
    } else {
      const missing = selectedItems.find((item, i) =>
        !photos[`before_${i}`] || !photos[`after_${i}`] || !photos[`photo_${i}`]
      )
      if (missing) { setError(`Complete all 3 photos for: ${missing.name}`); return }
    }

    setSubmitting(true)

    const buildFormData = () => {
      const fd = new FormData()
      fd.append('task_id', task.id)
      fd.append('item_installed',
        isProblem ? PROBLEM_LABEL : isService ? SERVICE_LABEL : selectedNames.join(', '))
      fd.append('remarks', remarks)
      // Quantities used, sent on the proof itself. Previously the only place a quantity was
      // written was the stock-install call below, which is skipped unless the technician holds
      // that item with a batch selected — so in practice every number typed here was lost, and
      // the consumption summary had nothing to add up.
      if (selectedItems.length > 0) {
        fd.append('items_used', JSON.stringify(selectedItems.map((it, i) => {
          const raw = installDetails[i]?.quantity
          const qty = (raw === undefined || raw === '') ? 1 : Number(raw)
          return { item_id: it.id, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 }
        })))
      }
      if (gps) { fd.append('latitude', gps.lat); fd.append('longitude', gps.lng) }
      if (isProblem) {
        // May legitimately send no photo at all. The submit endpoint saves whatever files
        // arrive and imposes no minimum, so an empty set is accepted.
        if (photos[PROBLEM_SLOT.key]) fd.append(PROBLEM_SLOT.key, photos[PROBLEM_SLOT.key])
      } else if (isService) {
        // The submit endpoint takes the form field name as the photo_type, so these need no
        // backend change — they store as service_before, service_prefilter, and so on.
        SERVICE_SLOTS.forEach(s => {
          if (photos[s.key]) fd.append(s.key, photos[s.key])
        })
      } else {
        selectedItems.forEach((_, i) => {
          if (photos[`before_${i}`]) fd.append(`before_photo_${i}`, photos[`before_${i}`])
          if (photos[`after_${i}`])  fd.append(`after_photo_${i}`,  photos[`after_${i}`])
          if (photos[`photo_${i}`])  fd.append(`item_photo_${i}`,   photos[`photo_${i}`])
        })
      }
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
    // Problem-at-site reports skip the data fields entirely. Half of them can't be answered
    // when the plant couldn't be run — TDS, flow and voltage have no reading to give — and
    // demanding them would produce invented numbers on a document the customer signs. The
    // signatures and the stamp stay mandatory: they are what makes it evidence.
    if (!isProblem) {
      if (!reportNo.trim())        missing.push('Report No')
      if (!complaintNo.trim())     missing.push('Complaint No')
      if (!problemDesc.trim())     missing.push('Problem Reported')
      if (!observation.trim())     missing.push('Observation & Action Taken')
      // A servicing/cleaning visit consumed no spares, so demanding a value here would force
      // the technician to invent one. It defaults to NIL on the report instead.
      if (!isService && !sparesRequired.trim() && selectedNames.length === 0) missing.push('Spares Required / Consumed')
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
    }
    if (!techSig)                missing.push('Your Signature')
    if (!principalSig)           missing.push('Customer Signature')
    if (!stampPhoto)             missing.push('School stamp photo')
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
        spare_parts:              sparesRequired || selectedNames.join(', ')
                                  || (isService ? 'NIL — servicing / cleaning only' : ''),
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
        technician_name:          techName,
        technician_mobile:        techMobile,
        customer_remarks:         customerRemarks,
        status,
        technician_signature_b64: techSig,
        principal_signature_b64:  principalSig,
        stamp_photo_b64:          stampPhoto,
      })
      setPdfUrl(res.data.pdf_url)
      // Remember the number so the next report is pre-filled. Only on success, so a typo that
      // failed validation isn't the thing that gets kept.
      try {
        if (techMobile.trim()) localStorage.setItem(TECH_MOBILE_KEY, techMobile.trim())
      } catch { /* private mode */ }
    } catch (e) {
      setError(e.response?.data?.detail || 'Service report failed. Try again.')
    }
    setSrSubmitting(false)
  }

  const doneCount = isProblem
    ? (photos[PROBLEM_SLOT.key] ? 1 : 0)
    : isService
    ? SERVICE_SLOTS.filter(s => photos[s.key]).length
    : selectedItems.reduce((acc, _, i) =>
        acc + (photos[`before_${i}`] ? 1 : 0) + (photos[`after_${i}`] ? 1 : 0) + (photos[`photo_${i}`] ? 1 : 0), 0
      )

  return (
    <>
      {activeCamera && (
        <CameraCapture
          gps={gps}
          siteName={task?.school_name}
          // The stamp photo is a close-up of one sheet of paper, so a 1:1 frame is what's
          // wanted — a full phone frame spends most of the image on floor and ceiling.
          square={activeCamera === 'stamp'}
          onCapture={(file, url) => handleCaptured(activeCamera, file, url)}
          onClose={() => setActiveCamera(null)}
        />
      )}

      <div className="modal-backdrop">
        <div className="modal-box" style={{ maxWidth: 500 }}>
          {/* Hide close on Step 3 until the PDF exists — but only where the report is
              actually mandatory, otherwise a temple visit would have no way out. */}
          {(step !== 3 || pdfUrl || !reportMandatory) && (
            <button className="modal-close" onClick={onClose}>✕</button>
          )}
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📸 Submit Work Proof</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{task.title}</div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {/* Step 1 is skipped in servicing mode, so don't tick it off as "Select Items" done. */}
            {[isProblem ? '1. Problem' : isService ? '1. Servicing' : '1. Select Items',
              isProblem ? '2. Photo (optional)' : '2. Take Photos',
              '3. Service Report'].map((label, i) => {
              const active = step === i + 1, done = step > i + 1
              return (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                  background: active ? 'rgba(34,211,238,.15)' : done ? 'rgba(52,211,153,.15)' : 'var(--surface2)',
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {categories.map(cat => {
                  const meta = catMeta(cat)
                  const active = activeCat === cat
                  return (
                    <button key={cat} onClick={() => setActiveCat(cat)} style={{
                      flex: '1 1 auto', minWidth: 100, padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `2px solid ${active ? meta.color : 'var(--border)'}`,
                      background: active ? meta.bg : 'var(--surface2)',
                      color: active ? meta.color : 'var(--muted)',
                      textAlign: 'center', lineHeight: 1.4
                    }}>
                      {meta.icon} {meta.short}
                      <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, color: 'inherit', opacity: 0.8 }}>
                        {stockItems.filter(s => s.category === cat).length} items
                      </div>
                    </button>
                  )
                })}

                {/* Nothing was replaced — skip the parts list entirely and go to photos. */}
                <button onClick={startServiceProof} style={{
                  flex: '1 1 auto', minWidth: 100, padding: '10px 8px', borderRadius: 10, fontSize: 12,
                  fontWeight: 700, cursor: 'pointer', border: '2px solid var(--yellow)',
                  background: 'rgba(251,191,36,.15)', color: 'var(--yellow)',
                  textAlign: 'center', lineHeight: 1.4
                }}>
                  🧽 Servicing / Cleaning
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                    no parts — {SERVICE_SLOTS.length} photos
                  </div>
                </button>

                {/* Nothing could be done — record the problem instead. Straight to one optional
                    photo, then the written report, which is what actually matters here. */}
                <button onClick={startProblemProof} style={{
                  flex: '1 1 auto', minWidth: 100, padding: '10px 8px', borderRadius: 10, fontSize: 12,
                  fontWeight: 700, cursor: 'pointer', border: '2px solid var(--red)',
                  background: 'rgba(248,113,113,.15)', color: 'var(--red)',
                  textAlign: 'center', lineHeight: 1.4
                }}>
                  ⚠️ Problem at Site
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                    no parts — 1 optional photo
                  </div>
                </button>
              </div>

              {/* Items for selected category */}
              {!activeCat ? (
                <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--muted)', fontSize: 12 }}>
                  ☝️ Select a category above to see its parts list
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
                      const meta = catMeta(activeCat)
                      return (
                        <button key={item.id} onClick={() => toggleItem(item)} style={{
                          padding: '6px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1.5px solid ${sel ? meta.color : inHandEntry ? 'var(--yellow)' : 'var(--border)'}`,
                          background: sel ? meta.bg : inHandEntry ? 'rgba(251,191,36,.1)' : 'var(--surface2)',
                          color: sel ? meta.color : inHandEntry ? 'var(--yellow)' : 'var(--text)',
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
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,211,238,.08)', border: '1px solid var(--accent)', fontSize: 12, marginBottom: 12 }}>
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

              {/* Servicing / cleaning — six fixed slots, no parts involved */}
              {isService && (
                <div style={{
                  border: `1.5px solid ${allPhotosDone ? 'var(--green)' : 'var(--yellow)'}`,
                  borderRadius: 12, padding: 12, marginBottom: 12,
                  background: allPhotosDone ? 'rgba(52,211,153,.04)' : 'rgba(251,191,36,.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>🧽</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Servicing / Cleaning</span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(251,191,36,.2)', color: 'var(--yellow)', border: '1px solid var(--yellow)'
                    }}>NO PARTS REPLACED</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    All {SERVICE_SLOTS.length} photos are required. Add extra photos below for anything else worth showing.
                  </div>
                  {SERVICE_SLOTS.map(s => (
                    <PhotoSlot
                      key={s.key}
                      label={s.label}
                      desc={s.desc}
                      icon={s.icon}
                      preview={previews[s.key]}
                      onOpen={() => setActiveCamera(s.key)}
                    />
                  ))}
                </div>
              )}

              {/* Problem at site — one photo, offered not demanded */}
              {isProblem && (
                <div style={{
                  border: '1.5px solid var(--red)', borderRadius: 12, padding: 12, marginBottom: 12,
                  background: 'rgba(248,113,113,.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Problem at Site</span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(248,113,113,.2)', color: 'var(--red)', border: '1px solid var(--red)'
                    }}>PHOTO OPTIONAL</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    Add a photo if the problem can be seen — skip it if it can't. The
                    <b> service report on the next step is required</b>, and that's where you
                    describe what's wrong.
                  </div>
                  <PhotoSlot
                    label={PROBLEM_SLOT.label}
                    desc={PROBLEM_SLOT.desc}
                    icon={PROBLEM_SLOT.icon}
                    preview={previews[PROBLEM_SLOT.key]}
                    onOpen={() => setActiveCamera(PROBLEM_SLOT.key)}
                  />
                </div>
              )}

              {/* Per-item photo groups */}
              {!isService && !isProblem && selectedItems.map((item, i) => {
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
                        background: itemDone ? 'rgba(52,211,153,.2)' : 'rgba(34,211,238,.15)',
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
                        fontSize: 12, fontWeight: 700, background: 'rgba(34,211,238,.15)', color: 'var(--accent)',
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
                <button className="btn btn-outline" onClick={backToItems} disabled={submitting}>← Back</button>
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
              {/* Say the photo is skippable, otherwise an empty slot reads as unfinished work
                  and the technician hunts for what's blocking them. */}
              {isProblem && !photos[PROBLEM_SLOT.key] && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  No photo needed — you can submit without one.
                </div>
              )}
              {/* This used to read "Photos submitted!" while sitting directly under the
                  "all photos required" warning — telling the technician the upload was done
                  before they had taken a single photo. It's a forward-looking hint, so word
                  it as one. */}
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                After submitting, Step 3 is the service report — signatures and stamp included.
              </div>
            </>
          )}

          {/* ── STEP 3: Service report + signatures ── */}
          {step === 3 && (
            <>
              {/* Mandatory notice — or, for a temple, an explicit way out */}
              {!pdfUrl && (reportMandatory ? (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                  {isProblem
                    ? <>🔒 Service report is required for a problem visit. <span style={{ fontWeight: 400 }}>
                        Fill in whatever you can — the fields are all optional here — but the two
                        signatures and the stamp photo are still needed.</span></>
                    : '🔒 Service report is mandatory — fill all fields and get signatures to complete this task.'}
                </div>
              ) : (
                <div style={{ background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
                    ✅ Photos saved — service report is optional here
                  </div>
                  <div style={{ color: 'var(--text)', lineHeight: 1.55 }}>
                    {task?.school_model === 'temple'
                      ? 'This is a temple, so the full service report isn\'t required for a routine visit.'
                      : 'A full service report isn\'t required for this visit.'}
                    {' '}Fill it in below only if there is something to record.
                  </div>
                  {/* Same handler the post-PDF Close button uses — the proof is already
                      saved and the task already sits at "submitted" awaiting review, so
                      leaving here loses nothing. */}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={onSubmitted}>
                    ✅ Done — skip the report
                  </button>
                </div>
              ))}
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
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

                  {/* Technician — printed on the report beside the engineer signature, so the
                      customer has a name and a number for whoever attended. Pre-filled from the
                      login; the number is remembered after the first report. */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', background: 'rgba(34,211,238,.08)', padding: '5px 10px', borderRadius: 6, marginBottom: 10 }}>
                    🔧 Service Engineer (you)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Technician Name</label>
                      <input value={techName} onChange={e => setTechName(e.target.value)}
                        placeholder="Your name" style={{ fontSize: 12 }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10 }}>Technician Mobile</label>
                      <input value={techMobile} onChange={e => setTechMobile(e.target.value)}
                        placeholder="10-digit mobile" style={{ fontSize: 12 }} />
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

                  {/* Mandatory photo of the stamped, signed and dated document.
                      This becomes the School Stamp on the PDF once verified. */}
                  <div style={{
                    padding: 12, borderRadius: 10, marginBottom: 14,
                    border: `2px solid ${stampPhoto ? 'var(--green)' : 'var(--red)'}`,
                    background: stampPhoto ? 'rgba(52,211,153,.06)' : 'rgba(244,63,94,.06)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: stampPhoto ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
                      {stampPhoto ? '✅ School stamp photo captured' : '📸 School stamp photo — required'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                      Take a photo of the paper showing the <b>school stamp</b>, the
                      <b> principal's signature</b> and the <b>date</b> together. It is added to the
                      service report as the school stamp once your proof is verified.
                    </div>

                    {/* Square, matching how it was captured. The old maxHeight+contain box
                        letterboxed it into a tall frame, which made a square photo look
                        wrong and a tall one look correct. */}
                    {stampPreview && (
                      <div style={{ width: 'min(100%, 260px)', aspectRatio: '1 / 1', margin: '0 auto 10px',
                                    borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <img src={stampPreview} alt="School stamp"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    )}

                    <button onClick={() => setActiveCamera('stamp')} style={{
                      width: '100%', padding: '10px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, border: 'none',
                      background: stampPhoto ? 'var(--surface2)' : 'var(--grad-primary)',
                      color: stampPhoto ? 'var(--text)' : '#fff',
                    }}>
                      📷 {stampPhoto ? 'Retake stamp photo' : 'Open Camera'}
                    </button>
                  </div>

                  {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }}
                      onClick={handleServiceReport} disabled={srSubmitting}>
                      {srSubmitting ? '⏳ Generating PDF…' : '✅ Generate Service Report PDF'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--yellow)', textAlign: 'center' }}>
                    ⚠️ All fields + both signatures + the stamp photo are required before generating the PDF
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
