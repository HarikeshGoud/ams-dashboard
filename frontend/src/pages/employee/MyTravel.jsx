import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import MapPicker from '../../components/MapPicker'

const STATUS_COLOR = { pending: 'var(--yellow)', approved: 'var(--green)', rejected: 'var(--red)' }

// ── Nominatim geocoder ────────────────────────────────────────────────────────
// Progressively simplifies address if exact match fails
async function geocode(text) {
  // Build a list of queries to try: full address → strip house no → area only
  const queries = [text]

  // Remove leading "house no.X-Y/Z, " style prefixes
  const noHouse = text.replace(/^(house\s*no\.?\s*[\w\d\/\-]+,?\s*)/i, '').trim()
  if (noHouse !== text) queries.push(noHouse)

  // Take last 2 comma-parts (area + city)
  const parts = text.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length > 2) queries.push(parts.slice(-2).join(', '))
  if (parts.length > 1) queries.push(parts[parts.length - 1])

  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Telangana, India')}&format=json&limit=1`
      const r = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await r.json()
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
      }
    } catch {}
  }
  return null
}

// ── Log Trip Modal ─────────────────────────────────────────────────────────────
function LogTripModal({ onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [step, setStep] = useState(1)         // 1=setup, 2=route calc, 3=confirm
  const [profile, setProfile] = useState({ bike_mileage: 45, home_location: '' })
  const [fuelPrice, setFuelPrice] = useState(105)
  const [todaySchools, setTodaySchools] = useState([])   // today's task schools
  const [form, setForm] = useState({ trip_date: today, from_location: '', mileage: 45, purpose: '', notes: '' })
  const [startCoords, setStartCoords] = useState(null)
  const [geocoding, setGeocoding] = useState(false)
  const [legs, setLegs] = useState([])         // [{label, school_id, lat, lng, distance_km}]
  const [totalKm, setTotalKm] = useState(0)
  const [calcAmount, setCalcAmount] = useState(0)
  const [calculating, setCalculating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pinning, setPinning] = useState(null)   // index of school being GPS-pinned
  const [showMapPicker, setShowMapPicker] = useState(false)

  useEffect(() => {
    // Load profile + fuel price + today's tasks
    Promise.all([
      api.get('/api/travel/my-profile'),
      api.get('/api/travel/fuel-settings'),
      api.get('/api/tasks/my-tasks'),
    ]).then(async ([p, f, t]) => {
      setProfile(p.data)
      setFuelPrice(f.data.fuel_price)
      setForm(prev => ({
        ...prev,
        from_location: p.data.home_location || '',
        mileage: p.data.bike_mileage || 45,
      }))
      // For schools without saved coordinates, geocode them on-the-fly using mandal + address
      const tasks = t.data.filter(task => task.school_id)
      const resolved = await Promise.all(tasks.map(async task => {
        let lat = task.school_lat
        let lng = task.school_lng
        if (!lat || !lng) {
          // Try with mandal/address context for better accuracy
          const searchTerms = [
            task.school_address,
            task.school_mandal ? `${task.school_name}, ${task.school_mandal}` : null,
            task.school_name,
          ].filter(Boolean)
          for (const term of searchTerms) {
            const coords = await geocode(term)
            if (coords) { lat = coords.lat; lng = coords.lng; break }
          }
        }
        return {
          label: task.school_name || task.title,
          school_id: task.school_id,
          lat, lng,
          hasCoords: !!(lat && lng),
          selected: false,
        }
      }))
      setTodaySchools(resolved)
    })
  }, [])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function toggleSchool(idx) {
    setTodaySchools(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))
  }

  function pinMyLocation(idx) {
    if (!navigator.geolocation) { setError('GPS not supported on this device'); return }
    setPinning(idx)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const school = todaySchools[idx]
        try {
          await api.patch(`/api/schools/${school.school_id}/coords`, null, { params: { lat, lng } })
          setTodaySchools(prev => prev.map((s, i) => i === idx ? { ...s, lat, lng, hasCoords: true } : s))
        } catch (e) {
          setError('Could not save GPS. Try again.')
        }
        setPinning(null)
      },
      () => { setError('Could not get GPS. Enable location on your phone.'); setPinning(null) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function geocodeStart() {
    if (!form.from_location.trim()) { setError('Tap the location field to pick on map'); return }
    // If already pinned via map picker, skip geocoding
    if (startCoords && startCoords.lat) { setStep(2); setError(''); return }
    setGeocoding(true); setError('')
    const coords = await geocode(form.from_location)
    setGeocoding(false)
    if (!coords) { setError('Location not found. Tap the field to pick on map instead.'); return }
    setStartCoords(coords)
    setStep(2)
    setError('')
  }

  async function calculateRoute() {
    const selected = todaySchools.filter(s => s.selected)
    if (selected.length === 0) { setError('Select at least one school visit'); return }
    setCalculating(true); setError('')

    const points = [
      { label: form.from_location, lat: startCoords.lat, lng: startCoords.lng },
      ...selected.map(s => ({ label: s.label, school_id: s.school_id, lat: s.lat, lng: s.lng })),
    ]

    try {
      const r = await api.post('/api/travel/calculate-route', { points })
      const { legs: calcLegs, total_km } = r.data
      // Attach coords to legs
      const enriched = calcLegs.map((leg, i) => ({
        ...leg,
        lat: points[i + 1].lat,
        lng: points[i + 1].lng,
        school_id: points[i + 1].school_id || null,
      }))
      setLegs(enriched)
      setTotalKm(total_km)
      const amt = Math.round(((total_km / form.mileage) * fuelPrice) + 50)
      setCalcAmount(amt)
      setStep(3)
    } catch (e) {
      setError('Route calculation failed. Check internet connection.')
    }
    setCalculating(false)
  }

  async function submit() {
    setLoading(true); setError('')
    try {
      const selected = todaySchools.filter(s => s.selected)
      await api.post('/api/travel/', {
        trip_date: form.trip_date,
        from_location: form.from_location,
        start_lat: startCoords.lat,
        start_lng: startCoords.lng,
        transport_mode: 'bike',
        mileage: Number(form.mileage),
        purpose: form.purpose,
        notes: form.notes,
        legs: selected.map(s => ({ label: s.label, school_id: s.school_id, lat: s.lat, lng: s.lng })),
      })
      onSaved(); onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save trip')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🏍️ Log Daily Trip</h3>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
          Fuel price: <b style={{ color: 'var(--green)' }}>Rs.{fuelPrice}/litre</b> · Extra allowance: <b style={{ color: 'var(--accent)' }}>+Rs.50</b>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {['Start', 'Visits', 'Confirm'].map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 4, borderRadius: 2,
                background: step > i ? 'var(--green)' : step === i + 1 ? 'var(--accent)' : 'var(--border)'
              }} />
              <div style={{ fontSize: 10, color: step === i + 1 ? 'var(--accent)' : 'var(--muted)', marginTop: 3 }}>{s}</div>
            </div>
          ))}
        </div>

        {/* Step 1: Start location + mileage */}
        {step === 1 && (
          <>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Date</label>
              <input type="date" value={form.trip_date} onChange={e => set('trip_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Start Location (your home address) *</label>
              <div
                onClick={() => setShowMapPicker(true)}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'var(--surface2)', cursor: 'pointer', fontSize: 13,
                  color: form.from_location ? 'var(--text)' : 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <span>{form.from_location || 'Tap to pick on map…'}</span>
                <span style={{ fontSize: 18 }}>🗺️</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                Tap to open map — search, pin, or use GPS
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Bike Mileage (km/litre) *</label>
              <input
                type="number" min="10" max="150" step="0.5"
                value={form.mileage}
                onChange={e => set('mileage', e.target.value)}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                This will be saved to your profile. Admin/deskwork can review this.
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Purpose (optional)</label>
              <input value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="e.g. Daily school visits" />
            </div>
          </>
        )}

        {/* Step 2: Select school visits */}
        {step === 2 && (
          <>
            <div style={{ background: 'rgba(52,211,153,.08)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
              📍 Start: <b>{form.from_location}</b>
              {startCoords && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>📌 Matched: {startCoords.label?.split(',').slice(0, 3).join(',')}</div>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Select today's school visits (in order)
            </div>
            {todaySchools.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--yellow)', padding: '10px', background: 'rgba(251,191,36,.08)', borderRadius: 8, marginBottom: 12 }}>
                ⏳ Loading school locations… or no tasks assigned for today.
              </div>
            ) : (
              todaySchools.map((s, i) => (
                <div key={i} style={{
                  borderRadius: 8, marginBottom: 6,
                  border: `1.5px solid ${s.selected ? 'var(--accent)' : s.hasCoords ? 'var(--border)' : 'rgba(251,191,36,.5)'}`,
                  background: s.selected ? 'rgba(56,189,248,.1)' : 'var(--surface2)',
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => s.hasCoords && toggleSchool(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: s.hasCoords ? 'pointer' : 'default' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${s.selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: s.selected ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                    }}>{s.selected ? '✓' : ''}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>🏫 {s.label}</div>
                      {s.hasCoords
                        ? <div style={{ fontSize: 10, color: 'var(--green)' }}>📍 {s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}</div>
                        : <div style={{ fontSize: 10, color: 'var(--yellow)' }}>⚠️ No GPS — tap button below to pin location</div>
                      }
                    </div>
                  </div>
                  {!s.hasCoords && (
                    <div style={{ padding: '0 12px 10px' }}>
                      <button
                        onClick={() => pinMyLocation(i)}
                        disabled={pinning === i}
                        style={{
                          width: '100%', padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                          background: 'rgba(251,191,36,.18)', color: '#fbbf24', fontWeight: 700, fontSize: 12,
                        }}>
                        {pinning === i ? '📡 Getting GPS…' : "📍 I'm Here — Pin This School"}
                      </button>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: 'center' }}>
                        Be at the school, then tap. Saves permanently.
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* Step 3: Review + confirm */}
        {step === 3 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Route Summary</div>
            {legs.map((leg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 7, marginBottom: 5, background: 'var(--surface2)', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{leg.from} → <b style={{ color: 'var(--text)' }}>{leg.to}</b></span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{leg.distance_km} km</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>Total Distance</span>
                <b style={{ color: 'var(--accent)' }}>{totalKm} km</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                <span>Fuel calc ({totalKm} km ÷ {form.mileage} kmpl × Rs.{fuelPrice})</span>
                <span>Rs.{Math.round((totalKm / form.mileage) * fuelPrice)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                <span>Extra allowance</span>
                <span>+ Rs.50</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, padding: '8px 10px', borderRadius: 8, background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)' }}>
                <span style={{ color: 'var(--green)' }}>Total Travel Amount</span>
                <span style={{ color: 'var(--green)' }}>Rs.{calcAmount}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Fuel price Rs.{fuelPrice}/litre · Mileage {form.mileage} kmpl · Subject to admin approval
            </div>
          </>
        )}

        {error && <div className="alert alert-red" style={{ marginTop: 10 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {step > 1 && (
            <button className="btn btn-outline" onClick={() => { setStep(s => s - 1); setError('') }}>← Back</button>
          )}
          {step === 1 && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={geocodeStart} disabled={geocoding}>
              {geocoding ? '🔍 Finding location…' : 'Next: Select Visits →'}
            </button>
          )}
          {step === 2 && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={calculateRoute} disabled={calculating}>
              {calculating ? '📡 Calculating via OSRM…' : 'Calculate Route →'}
            </button>
          )}
          {step === 3 && (
            <button className="btn btn-primary" style={{ flex: 1, background: 'var(--green)' }} onClick={submit} disabled={loading}>
              {loading ? '⏳ Saving…' : '✅ Submit for Approval'}
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>

      {showMapPicker && (
        <MapPicker
          initialLabel={form.from_location}
          onClose={() => setShowMapPicker(false)}
          onConfirm={async (picked) => {
            set('from_location', picked.label)
            setStartCoords({ lat: picked.lat, lng: picked.lng, label: picked.label })
            setShowMapPicker(false)
            // Save home coords to profile so auto-trip can use them
            try {
              await api.patch('/api/travel/my-profile', {
                bike_mileage: form.mileage || 45,
                home_location: picked.label,
                home_lat: picked.lat,
                home_lng: picked.lng,
              })
            } catch {}
          }}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyTravel() {
  const { user } = useAuthStore()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function calcToday() {
    setCalculating(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const r = await api.post('/api/travel/auto-from-reports', null, { params: { trip_date: today } })
      if (r.data.ok === false) {
        showToast('⚠️ ' + r.data.message)
      } else {
        showToast('✅ Travel calculated!')
        load()
      }
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.detail || 'Calculation failed'))
    }
    setCalculating(false)
  }

  function load() {
    api.get('/api/travel/')
      .then(r => { setTrips(r.data.filter(t => t.trip_type === 'auto')); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totalKm  = trips.reduce((s, t) => s + (t.distance_km || 0), 0)
  const totalAmt = trips.reduce((s, t) => s + (t.amount || 0), 0)
  const approved = trips.filter(t => t.status === 'approved').length
  const pending  = trips.filter(t => t.status === 'pending').length

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🏍️ My Travel</h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={calcToday} disabled={calculating}>
          {calculating ? '📡 Calculating…' : '⚡ Calculate Today\'s Travel'}
        </button>
      </div>

      {trips.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            ['🛣️ Total Distance', `${totalKm.toFixed(1)} km`, 'var(--accent)'],
            ['💰 Total Amount',   `Rs.${Math.round(totalAmt).toLocaleString('en-IN')}`, 'var(--green)'],
            ['✅ Approved',       approved, 'var(--green)'],
            ['⏳ Pending',        pending,  'var(--yellow)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="spinner" /> : trips.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏍️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No travel records yet</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Travel distance is automatically calculated when you submit geotagged proof photos</div>
        </div>
      ) : (
        trips.map(t => (
          <div key={t.id} style={{
            background: 'var(--surface)', border: `1px solid ${STATUS_COLOR[t.status] || 'var(--border)'}`,
            borderRadius: 10, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🏍️ {t.from_location}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.trip_type === 'auto' && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(139,92,246,.15)', color: '#a78bfa' }}>
                    ⚡ AUTO
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                  background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status]
                }}>{t.status}</span>
              </div>
            </div>
            {t.trip_type === 'auto' && (
              <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 4 }}>
                📸 Auto-calculated from geotagged proof submissions
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>📅 {t.trip_date}</div>

            {/* Route legs */}
            {t.route_legs?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {t.route_legs.map((leg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{leg.from} → <b style={{ color: 'var(--text)' }}>{leg.to}</b></span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{leg.distance_km} km</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
              <span>🛣️ <b>{t.distance_km?.toFixed(1)} km</b></span>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>Rs.{Math.round(t.amount).toLocaleString('en-IN')}</span>
              {t.mileage_used && <span style={{ color: 'var(--muted)' }}>{t.mileage_used} kmpl · Rs.{t.fuel_price_used}/L</span>}
            </div>
          </div>
        ))
      )}

      {/* Manual log trip removed — trips are auto-calculated from geotagged proof submissions */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
