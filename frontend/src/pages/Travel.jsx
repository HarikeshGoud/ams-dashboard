import { useState, useEffect } from 'react'
import api from '../api/axios'

const STATUS_COLOR = { pending: 'var(--yellow)', approved: 'var(--green)', rejected: 'var(--red)' }

export default function Travel() {
  const [trips, setTrips] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [fuelPrice, setFuelPrice] = useState(105)
  const [fuelInput, setFuelInput] = useState('')
  const [fuelSaving, setFuelSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([
      api.get('/api/travel/', { params: filterEmp ? { employee_id: filterEmp } : {} }),
      api.get('/api/employees/'),
      api.get('/api/travel/fuel-settings'),
    ]).then(([t, e, f]) => {
      setTrips(t.data)
      setEmployees(e.data.filter(emp => emp.role === 'technician'))
      setFuelPrice(f.data.fuel_price)
      setFuelInput(String(f.data.fuel_price))
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [filterEmp])

  async function saveFuelPrice() {
    if (!fuelInput || isNaN(fuelInput)) return
    setFuelSaving(true)
    await api.post('/api/travel/fuel-settings', { fuel_price: Number(fuelInput) })
    setFuelPrice(Number(fuelInput))
    setFuelSaving(false)
    showToast(`✅ Fuel price updated to Rs.${fuelInput}/litre`)
  }

  async function approve(id) {
    await api.patch(`/api/travel/${id}/approve`)
    load(); showToast('✅ Trip approved!')
  }

  async function reject(id) {
    await api.patch(`/api/travel/${id}/reject`)
    load(); showToast('❌ Trip rejected')
  }

  async function del(id) {
    if (!confirm('Delete this trip?')) return
    await api.delete(`/api/travel/${id}`)
    load(); showToast('Deleted')
  }

  const totalKm  = trips.reduce((s, t) => s + (t.distance_km || 0), 0)
  const totalAmt = trips.reduce((s, t) => s + (t.amount || 0), 0)
  const pending  = trips.filter(t => t.status === 'pending').length
  const approved = trips.filter(t => t.status === 'approved').length

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h3>🏍️ Travel Allowance</h3>
      </div>

      {/* Fuel price settings */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase' }}>
          ⛽ Fuel Price Settings
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>Current: <b style={{ color: 'var(--green)' }}>Rs.{fuelPrice}/litre</b></div>
          <input
            type="number" min="50" max="500" step="0.5" value={fuelInput}
            onChange={e => setFuelInput(e.target.value)}
            style={{ width: 100, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rs/litre</span>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveFuelPrice} disabled={fuelSaving}>
            {fuelSaving ? 'Saving…' : '💾 Update Price'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Formula: (distance ÷ mileage) × fuel price + Rs.50
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          ['🛣️ Total Distance', `${totalKm.toFixed(1)} km`, 'var(--accent)'],
          ['💰 Total Payout',   `Rs.${Math.round(totalAmt).toLocaleString('en-IN')}`, 'var(--green)'],
          ['⏳ Pending',        pending,  'var(--yellow)'],
          ['✅ Approved',       approved, 'var(--green)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 12 }}>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
          <option value="">All Technicians</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
        </select>
      </div>

      {/* Trip cards */}
      {trips.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No trips logged yet.</div>
      ) : (
        trips.map(t => (
          <div key={t.id} style={{
            background: 'var(--surface)', border: `1px solid ${STATUS_COLOR[t.status] || 'var(--border)'}`,
            borderRadius: 12, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>👤 {t.employee_name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>📅 {t.trip_date} · 🏍️ {t.from_location}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status]
              }}>{t.status}</span>
            </div>

            {/* Route legs (expandable) */}
            {t.route_legs?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {(expandedId === t.id ? t.route_legs : t.route_legs.slice(0, 2)).map((leg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px dashed var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{leg.from} → <b style={{ color: 'var(--text)' }}>{leg.to}</b></span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{leg.distance_km} km</span>
                  </div>
                ))}
                {t.route_legs.length > 2 && (
                  <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0' }}>
                    {expandedId === t.id ? '▲ Show less' : `▼ +${t.route_legs.length - 2} more legs`}
                  </button>
                )}
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <span>🛣️ <b>{t.distance_km?.toFixed(1)} km</b></span>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>Rs.{Math.round(t.amount).toLocaleString('en-IN')}</span>
              {t.mileage_used && <span style={{ color: 'var(--muted)' }}>{t.mileage_used} kmpl · Rs.{t.fuel_price_used}/L</span>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {t.status === 'pending' && (
                <>
                  <button onClick={() => approve(t.id)} style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: 'rgba(52,211,153,.2)', color: 'var(--green)'
                  }}>✅ Approve</button>
                  <button onClick={() => reject(t.id)} style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: 'rgba(248,113,113,.15)', color: 'var(--red)'
                  }}>❌ Reject</button>
                </>
              )}
              <button onClick={() => del(t.id)} style={{
                padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11
              }}>🗑️</button>
            </div>
          </div>
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
