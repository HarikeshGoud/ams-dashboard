import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

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

  useEffect(() => {
    // Load profile + fuel price + today's tasks
    Promise.all([
      api.get('/api/travel/my-profile'),
      api.get('/api/travel/fuel-settings'),
      api.get('/api/tasks/my-tasks'),
    ]).then(([p, f, t]) => {
      setProfile(p.data)
      setFuelPrice(f.data.fuel_price)
      setForm(prev => ({
        ...prev,
        from_location: p.data.home_location || '',
        mileage: p.data.bike_mileage || 45,
      }))
        // For schools without saved coordinates, geocode them on-the-fly
      const tasks = t.data.filter(task => task.school_id)
      const resolved = await Promise.all(tasks.map(async task => {
        let lat = task.school_lat
        let lng = task.school_lng
        if (!lat || !lng) {
          const coords = await geocode(task.school_name || task.title)
          if (coords) { lat = coords.lat; lng = coords.lng }
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

  async function geocodeStart() {
    if (!form.from_location.trim()) { setError('Enter your start location'); return }
    setGeocoding(true); setError('')
    const coords = await geocode(form.from_location)
    setGeocoding(false)
    if (!coords) { setError('Location not found. Skip the house number — enter just area/landmark and city. Example: "Uppal Depot, Hyderabad"'); return }
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
              <input
                value={form.from_location}
                onChange={e => set('from_location', e.target.value)}
                placeholder="e.g. Buddha Nagar Road No.7, Nalgonda"
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                Be specific — include landmark, area, city for accurate geocoding
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
                <div key={i}
                  onClick={() => s.hasCoords && toggleSchool(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                    cursor: s.hasCoords ? 'pointer' : 'not-allowed',
                    opacity: s.hasCoords ? 1 : 0.5,
                    border: `1.5px solid ${s.selected ? 'var(--accent)' : s.hasCoords ? 'var(--border)' : 'var(--red)'}`,
                    background: s.selected ? 'rgba(56,189,248,.1)' : 'var(--surface2)',
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${s.selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: s.selected ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0
                  }}>{s.selected ? '✓' : ''}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>🏫 {s.label}</div>
                    {s.hasCoords
                      ? <div style={{ fontSize: 10, color: 'var(--muted)' }}>📍 {s.lat?.toFixed(4)}, {s.lng?.toFixed(4)}</div>
                      : <div style={{ fontSize: 10, color: 'var(--red)' }}>⚠️ No coordinates — ask admin to run geocode script</div>
                    }
                  </div>
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
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyTravel() {
  const { user } = useAuthStore()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    api.get('/api/travel/')
      .then(r => { setTrips(r.data); setLoading(false) })
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
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowForm(true)}>
          + Log Trip
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
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No trips logged</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Log your daily travel — distance is auto-calculated via OSRM</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Log First Trip</button>
        </div>
      ) : (
        trips.map(t => (
          <div key={t.id} style={{
            background: 'var(--surface)', border: `1px solid ${STATUS_COLOR[t.status] || 'var(--border)'}`,
            borderRadius: 10, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🏍️ {t.from_location}</div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status]
              }}>{t.status}</span>
            </div>
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

      {showForm && <LogTripModal onClose={() => setShowForm(false)} onSaved={() => { load(); showToast('✅ Trip submitted for approval!') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
