import { useState, useEffect } from 'react'
import api from '../../api/axios'
import SearchableSelect from '../../components/SearchableSelect'

// Deskwork view of the employee directory.
// The API only returns technicians to a deskwork user, so this list is
// technicians-only by design — deskwork staff can view/edit them, and can add a
// new technician OR a new deskwork colleague (the new deskwork account simply
// won't appear in this list, since deskwork can't view deskwork accounts).
const BLANK = { name: '', phone: '', email: '', role: 'technician', designation: '', mandal_id: '' }

export default function DeskEmployees() {
  const [employees, setEmployees] = useState([])
  const [mandals, setMandals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)   // { name, employee_code, default_password }
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  function load() {
    Promise.all([api.get('/api/employees/'), api.get('/api/mandals/')])
      .then(([e, m]) => { setEmployees(e.data || []); setMandals(m.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openAdd() { setForm(BLANK); setEditId(null); setError(''); setModal(true) }
  function openEdit(e) {
    setForm({
      name: e.name, phone: e.phone || '', email: e.email || '',
      role: e.role, designation: e.designation || '', mandal_id: e.mandal_id || ''
    })
    setEditId(e.id); setError(''); setModal(true)
  }

  async function save(ev) {
    ev.preventDefault()
    setSaving(true); setError('')
    const data = { ...form, mandal_id: form.mandal_id ? parseInt(form.mandal_id) : null }
    try {
      if (editId) {
        await api.put(`/api/employees/${editId}`, data)
        showToast('✅ Technician updated')
      } else {
        const r = await api.post('/api/employees/', data)
        // Show the generated login once so it can be handed to the new joiner.
        setCreated({ name: r.data.name, role: r.data.role, employee_code: r.data.employee_code, default_password: r.data.default_password })
      }
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  const filtered = employees.filter(e => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [e.name, e.employee_code, e.mandal_name, e.phone, e.designation]
      .some(v => (v || '').toLowerCase().includes(q))
  })

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>👷 Technicians</h3>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      {/* New-login banner — the only place the default password is ever shown */}
      {created && (
        <div className="alert alert-green" style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ✅ {created.name} added{created.role === 'deskwork' ? ' as deskwork staff' : ''}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Login ID: <b style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{created.employee_code}</b>{'  ·  '}
            Password: <b style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{created.default_password}</b>
            <br />
            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
              Share this with them and ask them to change the password after their first login.
              {created.role === 'deskwork' && ' Deskwork accounts are not listed on this page.'}
            </span>
          </div>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setCreated(null)}>Got it</button>
        </div>
      )}

      <div className="filter-bar">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search name, ID, mandal…" style={{ minWidth: 240 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} of {employees.length} technicians
        </span>
      </div>

      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>#</th><th>Emp ID</th><th>Name</th><th>Designation</th><th>Mandal</th><th>Phone</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id}>
                  <td>{i + 1}</td>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', fontSize: 12 }}>{e.employee_code || '—'}</span></td>
                  <td style={{ fontWeight: 500 }}>{e.name}</td>
                  <td>{e.designation || '—'}</td>
                  <td>{e.mandal_name || '—'}</td>
                  <td>{e.phone || '—'}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(e)}>Edit</button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  {employees.length === 0 ? 'No technicians yet.' : 'No technicians match that search.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && setModal(false)}>
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              {editId ? 'Edit Technician' : '+ Add Employee'}
            </h3>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 16 }}>
              {editId
                ? 'A login ID and password were already created for this technician.'
                : 'A login ID and default password are created automatically.'}
            </p>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Name *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group"><label>Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group"><label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                {/* Role is only choosable when adding — deskwork staff can't convert
                    an existing technician into another role. */}
                {!editId ? (
                  <div className="form-group"><label>Role</label>
                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="technician">Technician</option>
                      <option value="deskwork">Deskwork</option>
                    </select>
                  </div>
                ) : (
                  <div className="form-group"><label>Role</label>
                    <div style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                      Technician
                    </div>
                  </div>
                )}
                <div className="form-group"><label>Designation</label>
                  <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
                </div>
                <div className="form-group form-full"><label>Mandal</label>
                  <SearchableSelect value={form.mandal_id} onChange={val => setForm({ ...form, mandal_id: val })}
                    placeholder="Select mandal…"
                    options={mandals.map(m => ({ value: String(m.id), label: m.name }))} />
                </div>
              </div>

              {!editId && form.role === 'deskwork' && (
                <div className="alert alert-blue" style={{ margin: '14px 0 0', display: 'block', fontSize: 12 }}>
                  ℹ️ Deskwork accounts don’t appear on this page — you’ll see the new login details right after saving, so note them down.
                </div>
              )}
              {error && (
                <div className="alert alert-red" style={{ margin: '14px 0 0' }}><span>⚠️</span><div>{error}</div></div>
              )}

              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
