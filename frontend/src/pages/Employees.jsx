import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [mandals, setMandals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', role: 'technician', designation: '', mandal_id: '' })
  const [editId, setEditId] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    Promise.all([api.get('/api/employees/'), api.get('/api/mandals/')]).then(([e, m]) => {
      setEmployees(e.data); setMandals(m.data); setLoading(false)
    })
  }, [])

  function openAdd() { setForm({ name: '', phone: '', email: '', role: 'technician', designation: '', mandal_id: '' }); setEditId(null); setModal(true) }
  function openEdit(e) { setForm({ name: e.name, phone: e.phone || '', email: e.email || '', role: e.role, designation: e.designation || '', mandal_id: e.mandal_id || '' }); setEditId(e.id); setModal(true) }

  async function save(ev) {
    ev.preventDefault()
    const data = { ...form, mandal_id: form.mandal_id ? parseInt(form.mandal_id) : null }
    if (editId) await api.put(`/api/employees/${editId}`, data)
    else await api.post('/api/employees/', data)
    const r = await api.get('/api/employees/')
    setEmployees(r.data); setModal(false); showToast(editId ? 'Updated!' : 'Employee added!')
  }

  async function del(id) {
    if (!confirm('Delete employee?')) return
    await api.delete(`/api/employees/${id}`)
    setEmployees(employees.filter(e => e.id !== id)); showToast('Deleted')
  }

  async function resetPassword(emp) {
    if (!confirm(`Reset password for ${emp.name} to default (${emp.employee_code?.replace(/([A-Za-z]+)(\d+)/, '$1@$2')})?`)) return
    try {
      const r = await api.post(`/api/auth/admin-reset-password/${emp.id}`)
      showToast(`✅ ${r.data.message}`)
    } catch { showToast('Reset failed') }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>👷 Employee Directory</h3>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>#</th><th>Emp ID</th><th>Name</th><th>Role</th><th>Designation</th><th>Mandal</th><th>Phone</th><th>Action</th></tr>
            </thead>
            <tbody>
              {employees.map((e, i) => (
                <tr key={e.id}>
                  <td>{i + 1}</td>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', fontSize: 12 }}>{e.employee_code || '—'}</span></td>
                  <td style={{ fontWeight: 500 }}>{e.name}</td>
                  <td><span className={`pill ${e.role === 'admin' ? 'pill-purple' : 'pill-blue'}`}>{e.role}</span></td>
                  <td>{e.designation || '—'}</td>
                  <td>{e.mandal_name || '—'}</td>
                  <td>{e.phone || '—'}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(e)}>Edit</button>{' '}
                    <button className="btn btn-outline btn-sm" style={{ color: 'var(--yellow)', borderColor: 'var(--yellow)' }} onClick={() => resetPassword(e)} title="Reset to default password">🔑 Reset</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => del(e.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && setModal(false)}>
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editId ? 'Edit Employee' : '+ Add Employee'}</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Name *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                <div className="form-group"><label>Role</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                    <option value="technician">Technician</option>
                    <option value="deskwork">Deskwork</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group"><label>Designation</label><input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} /></div>
                <div className="form-group form-full"><label>Mandal</label>
                  <SearchableSelect value={form.mandal_id} onChange={val => setForm({...form, mandal_id: val})}
                    placeholder="Select mandal…"
                    options={mandals.map(m => ({ value: String(m.id), label: m.name }))} />
                </div>
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
