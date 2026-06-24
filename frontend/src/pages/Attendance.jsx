import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Attendance() {
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employee_id: '', date: new Date().toISOString().slice(0,10), status: 'present', check_in: '', check_out: '', notes: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/attendance/'), api.get('/api/employees/')]).then(([a, e]) => {
      setRecords(a.data); setEmployees(e.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function save(ev) {
    ev.preventDefault()
    await api.post('/api/attendance/mark', { ...form, employee_id: parseInt(form.employee_id) })
    load(); setModal(false); showToast('Attendance marked!')
  }

  const statusPill = { present: 'pill-green', absent: 'pill-red', half_day: 'pill-yellow', leave: 'pill-orange' }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>🗓️ Attendance</h3>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Mark Attendance</button>
      </div>
      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>Date</th><th>Employee</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.employee_name}</td>
                  <td><span className={`pill ${statusPill[r.status] || 'pill-gray'}`}>{r.status}</span></td>
                  <td>{r.check_in || '—'}</td>
                  <td>{r.check_out || '—'}</td>
                  <td>{r.notes || '—'}</td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>No records</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Mark Attendance</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Employee *</label>
                  <select required value={form.employee_id} onChange={f('employee_id')}>
                    <option value="">Select...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={f('date')} /></div>
                <div className="form-group"><label>Status</label>
                  <select value={form.status} onChange={f('status')}>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="half_day">Half Day</option>
                    <option value="leave">Leave</option>
                  </select>
                </div>
                <div className="form-group"><label>Check In</label><input type="time" value={form.check_in} onChange={f('check_in')} /></div>
                <div className="form-group"><label>Check Out</label><input type="time" value={form.check_out} onChange={f('check_out')} /></div>
                <div className="form-group form-full"><label>Notes</label><input value={form.notes} onChange={f('notes')} /></div>
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
