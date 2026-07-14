import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

export default function Visits() {
  const [visits, setVisits] = useState([])
  const [employees, setEmployees] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ school_id: '', employee_id: '', visit_date: new Date().toISOString().slice(0,10), visit_type: 'routine', tds_reading: '', ph_reading: '', filters_used: 0, work_done: '', remarks: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  useEffect(() => {
    Promise.all([
      api.get('/api/visits/'),
      api.get('/api/employees/'),
      api.get('/api/schools/?limit=200')
    ]).then(([v, e, s]) => {
      setVisits(v.data.items); setEmployees(e.data); setSchools(s.data.items); setLoading(false)
    })
  }, [])

  async function save(ev) {
    ev.preventDefault()
    if (!form.employee_id || !form.school_id) { showToast('❌ Select employee and school'); return }
    await api.post('/api/visits/', {
      ...form, school_id: parseInt(form.school_id), employee_id: parseInt(form.employee_id),
      tds_reading: form.tds_reading ? parseFloat(form.tds_reading) : null,
      ph_reading: form.ph_reading ? parseFloat(form.ph_reading) : null,
      filters_used: parseInt(form.filters_used) || 0
    })
    const r = await api.get('/api/visits/')
    setVisits(r.data.items); setModal(false); showToast('Visit logged!')
  }

  async function del(id) {
    if (!confirm('Delete visit?')) return
    await api.delete(`/api/visits/${id}`)
    setVisits(visits.filter(v => v.id !== id)); showToast('Deleted')
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>📋 Visits</h3>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Log Visit</button>
      </div>
      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>Date</th><th>Employee</th><th>School</th><th>Type</th><th>TDS</th><th>pH</th><th>Filters</th><th>Action</th></tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id}>
                  <td>{v.visit_date}</td>
                  <td>{v.employee_name}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.school_name}</td>
                  <td><span className="pill pill-blue">{v.visit_type}</span></td>
                  <td>{v.tds_reading ?? '—'}</td>
                  <td>{v.ph_reading ?? '—'}</td>
                  <td>{v.filters_used}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => del(v.id)}>Del</button></td>
                </tr>
              ))}
              {visits.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>No visits yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Log Field Visit</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group"><label>Employee *</label>
                  <SearchableSelect value={form.employee_id} onChange={val => setForm({ ...form, employee_id: val })}
                    placeholder="Select…" options={employees.map(e => ({ value: String(e.id), label: e.name }))} />
                </div>
                <div className="form-group"><label>School *</label>
                  <SearchableSelect value={form.school_id} onChange={val => setForm({ ...form, school_id: val })}
                    placeholder="Select…" options={schools.map(s => ({ value: String(s.id), label: s.name }))} />
                </div>
                <div className="form-group"><label>Date *</label><input type="date" required value={form.visit_date} onChange={f('visit_date')} /></div>
                <div className="form-group"><label>Type</label>
                  <select value={form.visit_type} onChange={f('visit_type')}>
                    <option value="routine">Routine</option>
                    <option value="complaint">Complaint</option>
                    <option value="amc">AMC</option>
                    <option value="installation">Installation</option>
                  </select>
                </div>
                <div className="form-group"><label>TDS Reading (ppm)</label><input type="number" value={form.tds_reading} onChange={f('tds_reading')} placeholder="e.g. 142" /></div>
                <div className="form-group"><label>pH Reading</label><input type="number" step="0.1" value={form.ph_reading} onChange={f('ph_reading')} placeholder="e.g. 7.2" /></div>
                <div className="form-group"><label>Filters Used</label><input type="number" value={form.filters_used} onChange={f('filters_used')} min="0" /></div>
                <div className="form-group form-full"><label>Work Done</label><textarea value={form.work_done} onChange={f('work_done')} rows={2} /></div>
                <div className="form-group form-full"><label>Remarks</label><textarea value={form.remarks} onChange={f('remarks')} rows={2} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Save Visit</button>
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
