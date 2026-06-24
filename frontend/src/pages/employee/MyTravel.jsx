import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

const MODE_ICON = { bike: '🏍️', car: '🚗', bus: '🚌', auto: '🛺', walk: '🚶', train: '🚆', other: '🚌' }
const STATUS_COLOR = { pending: 'var(--yellow)', approved: 'var(--green)', rejected: 'var(--red)' }

function LogTripModal({ onClose, onSaved, employeeId }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    trip_date: today,
    from_location: '',
    to_location: '',
    transport_mode: 'bike',
    distance_km: '',
    purpose: '',
    amount: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    if (!form.from_location.trim() || !form.to_location.trim()) {
      setError('Enter from and to locations'); return
    }
    setLoading(true); setError('')
    try {
      await api.post('/api/travel/', {
        employee_id: employeeId,
        trip_date: form.trip_date,
        from_location: form.from_location,
        to_location: form.to_location,
        transport_mode: form.transport_mode,
        distance_km: form.distance_km ? Number(form.distance_km) : 0,
        purpose: form.purpose,
        amount: form.amount ? Number(form.amount) : 0,
        notes: form.notes,
      })
      onSaved(); onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save')
    }
    setLoading(false)
  }

  const MODES = ['bike', 'car', 'bus', 'auto', 'walk', 'train', 'other']

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🚗 Log Trip</h3>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Date</label>
          <input type="date" value={form.trip_date} onChange={e => set('trip_date', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>From *</label>
            <input value={form.from_location} onChange={e => set('from_location', e.target.value)} placeholder="e.g. Home / Hyderabad" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>To *</label>
            <input value={form.to_location} onChange={e => set('to_location', e.target.value)} placeholder="e.g. School / Village" />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Transport Mode</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button key={m} onClick={() => set('transport_mode', m)} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: `1.5px solid ${form.transport_mode === m ? 'var(--accent)' : 'var(--border)'}`,
                background: form.transport_mode === m ? 'rgba(56,189,248,.15)' : 'var(--surface2)',
                color: form.transport_mode === m ? 'var(--accent)' : 'var(--text)'
              }}>
                {MODE_ICON[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Distance (km)</label>
            <input type="number" min="0" step="0.1" value={form.distance_km} onChange={e => set('distance_km', e.target.value)} placeholder="0" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Amount (₹)</label>
            <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Purpose</label>
          <input value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="e.g. School visit, AMC work, Office meeting…" />
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Notes (optional)</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional info…" />
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
            {loading ? '⏳ Saving…' : '✅ Save Trip'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

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
        <h3>🚗 My Travel</h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => setShowForm(true)}>
          + Log Trip
        </button>
      </div>

      {trips.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            ['🛣️ Total Distance', `${totalKm.toFixed(1)} km`, 'var(--accent)'],
            ['💰 Total Amount',  `₹${totalAmt.toLocaleString('en-IN')}`, 'var(--green)'],
            ['✅ Approved',      approved, 'var(--green)'],
            ['⏳ Pending',       pending,  'var(--yellow)'],
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚗</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No trips logged</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Log your daily travel from home to work and between sites</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Log First Trip</button>
        </div>
      ) : (
        trips.map(t => (
          <div key={t.id} style={{
            background: 'var(--surface)', border: `1px solid ${STATUS_COLOR[t.status] || 'var(--border)'}`,
            borderRadius: 10, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {MODE_ICON[t.transport_mode] || '🚌'} {t.from_location} → {t.to_location}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                background: `${STATUS_COLOR[t.status] || 'var(--muted)'}22`,
                color: STATUS_COLOR[t.status] || 'var(--muted)'
              }}>{t.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>📅 {t.trip_date}</div>
            {t.purpose && <div style={{ fontSize: 12, marginTop: 4 }}>🎯 {t.purpose}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12 }}>
              {t.distance_km > 0 && <span>🛣️ <b>{t.distance_km} km</b></span>}
              {t.amount > 0 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>₹{t.amount.toLocaleString('en-IN')}</span>}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <LogTripModal
          employeeId={user?.id}
          onClose={() => setShowForm(false)}
          onSaved={() => { load(); showToast('✅ Trip logged!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
