import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Travel() {
  const [trips, setTrips] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employee_id: '', trip_date: new Date().toISOString().slice(0,10), from_location: '', to_location: '', purpose: '', distance_km: '', transport_mode: 'bike', amount: '', notes: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/travel/'), api.get('/api/employees/')]).then(([t, e]) => {
      setTrips(t.data); setEmployees(e.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function save(ev) {
    ev.preventDefault()
    await api.post('/api/travel/', { ...form, employee_id: parseInt(form.employee_id), distance_km: parseFloat(form.distance_km)||null, amount: parseFloat(form.amount)||0 })
    load(); setModal(false); showToast('Trip logged!')
  }

  async function approve(id) {
    await api.patch(`/api/travel/${id}/approve`)
    load(); showToast('Approved!')
  }

  async function del(id) {
    if (!confirm('Delete?')) return
    await api.delete(`/api/travel/${id}`)
    setTrips(trips.filter(t => t.id !== id))
  }

  const total = trips.reduce((a, t) => a + t.amount, 0)
  const statusPill = { pending: 'pill-yellow', approved: 'pill-green', rejected: 'pill-red', paid: 'pill-cyan' }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>🚗 Travel Allowance</h3>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Log Trip</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card cyan"><div className="kpi-label">Total Trips</div><div className="kpi-value">{trips.length}</div></div>
        <div className="kpi-card green"><div className="kpi-label">Total Amount</div><div className="kpi-value" style={{ fontSize: 20 }}>₹{Number(total).toLocaleString('en-IN')}</div></div>
        <div className="kpi-card yellow"><div className="kpi-label">Pending</div><div className="kpi-value">{trips.filter(t => t.status === 'pending').length}</div></div>
      </div>
      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>Date</th><th>Employee</th><th>From → To</th><th>Mode</th><th>Distance</th><th>Amount</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {trips.map(t => (
                <tr key={t.id}>
                  <td>{t.trip_date}</td>
                  <td>{t.employee_name}</td>
                  <td>{t.from_location} → {t.to_location}</td>
                  <td>{t.transport_mode}</td>
                  <td>{t.distance_km ? `${t.distance_km} km` : '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--green)' }}>₹{Number(t.amount).toLocaleString('en-IN')}</td>
                  <td><span className={`pill ${statusPill[t.status] || 'pill-gray'}`}>{t.status}</span></td>
                  <td>
                    {t.status === 'pending' && <button className="btn btn-green btn-sm" onClick={() => approve(t.id)}>Approve</button>}{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>Del</button>
                  </td>
                </tr>
              ))}
              {trips.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>No trips logged</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Log Trip</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Employee *</label>
                  <select required value={form.employee_id} onChange={f('employee_id')}>
                    <option value="">Select...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input type="date" value={form.trip_date} onChange={f('trip_date')} /></div>
                <div className="form-group"><label>Mode</label>
                  <select value={form.transport_mode} onChange={f('transport_mode')}>
                    <option value="bike">Bike</option><option value="auto">Auto</option>
                    <option value="bus">Bus</option><option value="train">Train</option><option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group"><label>From *</label><input required value={form.from_location} onChange={f('from_location')} /></div>
                <div className="form-group"><label>To *</label><input required value={form.to_location} onChange={f('to_location')} /></div>
                <div className="form-group"><label>Distance (km)</label><input type="number" value={form.distance_km} onChange={f('distance_km')} /></div>
                <div className="form-group"><label>Amount (₹) *</label><input required type="number" value={form.amount} onChange={f('amount')} /></div>
                <div className="form-group form-full"><label>Purpose</label><input value={form.purpose} onChange={f('purpose')} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
