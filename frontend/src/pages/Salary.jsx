import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Salary() {
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ employee_id: '', month: new Date().getMonth()+1, year: new Date().getFullYear(), basic_salary: '', allowances: 0, deductions: 0 })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/salary/'), api.get('/api/employees/')]).then(([s, e]) => {
      setRecords(s.data); setEmployees(e.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function save(ev) {
    ev.preventDefault()
    await api.post('/api/salary/', { ...form, employee_id: parseInt(form.employee_id), month: parseInt(form.month), year: parseInt(form.year), basic_salary: parseFloat(form.basic_salary), allowances: parseFloat(form.allowances)||0, deductions: parseFloat(form.deductions)||0 })
    load(); setModal(false); showToast('Saved!')
  }

  const total = records.reduce((a, r) => a + r.net_salary, 0)

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>🧾 Salary Management</h3>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Add Record</button>
      </div>
      <div className="card">
        <div className="card-title">Salary Records</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Month/Year</th><th>Basic (₹)</th><th>Allowances</th><th>Deductions</th><th>Net (₹)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>{r.employee_name}</td>
                  <td>{r.month}/{r.year}</td>
                  <td>{Number(r.basic_salary).toLocaleString('en-IN')}</td>
                  <td>{Number(r.allowances).toLocaleString('en-IN')}</td>
                  <td>{Number(r.deductions).toLocaleString('en-IN')}</td>
                  <td style={{ fontWeight: 600 }}>₹{Number(r.net_salary).toLocaleString('en-IN')}</td>
                  <td><span className={`pill ${r.status === 'paid' ? 'pill-green' : 'pill-yellow'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>Total Payroll</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>₹{Number(total).toLocaleString('en-IN')}</span>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Add Salary Record</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Employee *</label>
                  <select required value={form.employee_id} onChange={f('employee_id')}>
                    <option value="">Select...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Month</label>
                  <select value={form.month} onChange={f('month')}>
                    {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(0,i).toLocaleString('default',{month:'long'})}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Year</label><input type="number" value={form.year} onChange={f('year')} /></div>
                <div className="form-group"><label>Basic Salary (₹) *</label><input required type="number" value={form.basic_salary} onChange={f('basic_salary')} /></div>
                <div className="form-group"><label>Allowances (₹)</label><input type="number" value={form.allowances} onChange={f('allowances')} /></div>
                <div className="form-group"><label>Deductions (₹)</label><input type="number" value={form.deductions} onChange={f('deductions')} /></div>
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
