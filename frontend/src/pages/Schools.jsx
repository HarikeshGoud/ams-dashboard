import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Schools() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [mandals, setMandals] = useState([])
  const [clients, setClients] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [mandalFilter, setMandalFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', client_id: '', model: 'normal', mandal: '', capacity: '', plant_model: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 50 })
    if (search) params.append('search', search)
    if (mandalFilter) params.append('mandal_id', mandalFilter)
    api.get(`/api/schools/?${params}`).then(r => { setData(r.data); setLoading(false) })
  }

  useEffect(() => {
    api.get('/api/mandals/').then(r => setMandals(r.data))
    api.get('/api/clients/').then(r => setClients(r.data))
  }, [])

  useEffect(() => { load() }, [page, search, mandalFilter])

  function openAdd() { setForm({ name: '', client_id: '', model: 'normal', mandal: '', capacity: '', plant_model: '' }); setEditId(null); setModal(true) }
  function openEdit(s) { setForm({ name: s.name, client_id: s.client_id || '', model: s.model, mandal: s.mandal_name || '', capacity: s.capacity || '', plant_model: s.plant_model || '' }); setEditId(s.id); setModal(true) }

  async function save(ev) {
    ev.preventDefault()
    const payload = { ...form, client_id: form.client_id ? parseInt(form.client_id) : null }
    if (editId) await api.put(`/api/schools/${editId}`, payload)
    else await api.post('/api/schools/', payload)
    load(); setModal(false); showToast(editId ? 'Updated!' : 'School added!')
  }

  async function del(id) {
    if (!confirm('Remove school?')) return
    await api.delete(`/api/schools/${id}`)
    load(); showToast('Removed')
  }

  const totalPages = Math.ceil(data.total / 50)

  return (
    <div>
      <div className="section-header">
        <h3>🏫 Schools / Sites <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>({data.total} total)</span></h3>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Site</button>
      </div>
      <div className="filter-bar">
        <input placeholder="Search school..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ minWidth: 180 }} />
        <select value={mandalFilter} onChange={e => { setMandalFilter(e.target.value); setPage(1) }}>
          <option value="">All Mandals</option>
          {mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="card">
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap scroll-table">
            <table>
              <thead>
                <tr><th>#</th><th>School Name</th><th>Client</th><th>Model</th><th>Mandal</th><th>Last Visit</th><th>AMC</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.items.map((s, i) => (
                  <tr key={s.id}>
                    <td>{(page - 1) * 50 + i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>{s.client_name || '—'}</td>
                    <td><span className={`pill ${s.model === 'temple' ? 'pill-orange' : 'pill-blue'}`}>{s.model}</span></td>
                    <td>{s.mandal_name || '—'}</td>
                    <td>{s.last_visit_date || '—'}</td>
                    <td><span className={`pill ${s.amc_status === 'active' ? 'pill-green' : 'pill-red'}`}>{s.amc_status}</span></td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>Edit</button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex gap-8 mt-16" style={{ justifyContent: 'center' }}>
            <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editId ? 'Edit Site' : '+ Add Site'}</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>School Name *</label><input required value={form.name} onChange={f('name')} /></div>
                <div className="form-group"><label>Client</label>
                  <select value={form.client_id} onChange={f('client_id')}>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Model</label>
                  <select value={form.model} onChange={f('model')}>
                    <option value="normal">Normal</option>
                    <option value="temple">Temple</option>
                  </select>
                </div>
                <div className="form-group"><label>Mandal</label>
                  <select value={form.mandal} onChange={f('mandal')}>
                    <option value="">Select mandal...</option>
                    {mandals.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Capacity</label><input value={form.capacity} onChange={f('capacity')} placeholder="e.g. 1000 LPH" /></div>
                <div className="form-group form-full"><label>Plant Model</label><input value={form.plant_model} onChange={f('plant_model')} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Save Site</button>
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
