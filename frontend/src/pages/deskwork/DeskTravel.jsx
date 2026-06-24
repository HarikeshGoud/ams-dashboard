import { useState, useEffect } from 'react'
import api from '../../api/axios'

const MODES = ['bike', 'car', 'bus', 'auto', 'walk', 'train']
const MODE_ICON = { bike: '🏍️', car: '🚗', bus: '🚌', auto: '🛺', walk: '🚶', train: '🚂' }

export default function DeskTravel() {
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/api/travel/', { params: filterEmp ? { employee_id: filterEmp } : {} }),
      api.get('/api/employees/')
    ]).then(([t, e]) => {
      setRecords(t.data || [])
      setEmployees(e.data.filter(emp => emp.role === 'technician'))
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterEmp])

  const totalKm = records.reduce((s, r) => s + (r.distance_km || 0), 0)
  const totalAmt = records.reduce((s, r) => s + (r.amount || 0), 0)
  const approved = records.filter(r => r.status === 'approved').length

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🚗 Travel Management</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowLog(true)}>+ Log Trip</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['📏 Total Km', `${totalKm.toFixed(1)} km`, 'var(--accent)'],
          ['💰 Total Amount', `₹${totalAmt.toLocaleString('en-IN')}`, 'var(--green)'],
          ['✅ Approved', approved, 'var(--green)'],
          ['📋 Total Trips', records.length, 'var(--muted)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
        </select>
      </div>

      {loading ? <div className="spinner" /> : records.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No travel records found.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                {['Employee', 'Date', 'Route', 'Mode', 'Distance', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 600 }}>
                    {r.employee_name || '—'}
                    {r.employee_code && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>[{r.employee_code}]</span>}
                  </td>
                  <td style={{ padding: '10px 10px', color: 'var(--muted)' }}>{r.travel_date || r.date}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontSize: 12 }}>{r.from_location || r.from_place || '—'}</span>
                    <span style={{ color: 'var(--muted)', margin: '0 4px' }}>→</span>
                    <span style={{ fontSize: 12 }}>{r.to_location || r.to_place || '—'}</span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>{MODE_ICON[r.transport_mode || r.mode] || '🚗'} {r.transport_mode || r.mode || '—'}</td>
                  <td style={{ padding: '10px 10px', fontWeight: 600 }}>{(r.distance_km || 0).toFixed(1)} km</td>
                  <td style={{ padding: '10px 10px' }}>₹{(r.amount || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                      background: r.status === 'approved' ? 'rgba(52,211,153,.15)' : r.status === 'rejected' ? 'rgba(248,113,113,.15)' : 'rgba(251,191,36,.15)',
                      color: r.status === 'approved' ? 'var(--green)' : r.status === 'rejected' ? 'var(--red)' : 'var(--yellow)'
                    }}>{r.status || 'pending'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showLog && (
        <LogTripModal
          employees={employees}
          onClose={() => setShowLog(false)}
          onSaved={() => { load(); showToast('✅ Trip logged!') }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function LogTripModal({ employees, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ employee_id: '', travel_date: today, from_location: '', to_location: '', transport_mode: 'bike', distance_km: '', amount: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  async function submit() {
    if (!form.employee_id || !form.from_location.trim() || !form.to_location.trim()) {
      setError('Select employee and fill route'); return
    }
    setLoading(true); setError('')
    try {
      await api.post('/api/travel/', {
        employee_id: Number(form.employee_id),
        travel_date: form.travel_date,
        from_location: form.from_location,
        to_location: form.to_location,
        transport_mode: form.transport_mode,
        distance_km: Number(form.distance_km) || 0,
        amount: Number(form.amount) || 0
      })
      onSaved(); onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Failed') }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🚗 Log Trip</h3>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Employee *</label>
            <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
              <option value="">Select…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.travel_date} onChange={e => set('travel_date', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>From *</label>
            <input value={form.from_location} onChange={e => set('from_location', e.target.value)} placeholder="Starting point" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>To *</label>
            <input value={form.to_location} onChange={e => set('to_location', e.target.value)} placeholder="Destination" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Transport Mode</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button key={m} onClick={() => set('transport_mode', m)} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: form.transport_mode === m ? 700 : 400,
                background: form.transport_mode === m ? 'rgba(56,189,248,.15)' : 'var(--surface2)',
                border: `1px solid ${form.transport_mode === m ? 'var(--accent)' : 'var(--border)'}`,
                color: form.transport_mode === m ? 'var(--accent)' : 'var(--muted)'
              }}>{MODE_ICON[m]} {m}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Distance (km)</label>
            <input type="number" min="0" step="0.1" value={form.distance_km} onChange={e => set('distance_km', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Amount (₹)</label>
            <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? '⏳…' : 'Log Trip'}</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
