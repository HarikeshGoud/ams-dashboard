import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'

export default function Schools() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [mandals, setMandals] = useState([])
  const [clients, setClients] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [mandalFilter, setMandalFilter] = useState('')
  const [techFilter, setTechFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', client_id: '', model: 'school', mandal: '', capacity: '', plant_model: '', unit_number: '', amc_status: 'amc' })
  const [toast, setToast] = useState('')
  const [stampFile, setStampFile] = useState(null)
  const [stampPreview, setStampPreview] = useState(null)
  const [existingStamp, setExistingStamp] = useState(null)
  const [stampSaving, setStampSaving] = useState(false)
  const stampInputRef = useRef(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 50 })
    if (search) params.append('search', search)
    if (mandalFilter) params.append('mandal_id', mandalFilter)
    if (techFilter) params.append('technician_id', techFilter)
    api.get(`/api/schools/?${params}`).then(r => { setData(r.data); setLoading(false) })
  }

  useEffect(() => {
    api.get('/api/mandals/').then(r => setMandals(r.data))
    api.get('/api/clients/').then(r => setClients(r.data))
    api.get('/api/employees/').then(r => {
      setTechnicians(r.data.filter(e => e.role === 'technician'))
    })
  }, [])

  useEffect(() => { load() }, [page, search, mandalFilter, techFilter])


  function openAdd() {
    setForm({ name: '', client_id: '', model: 'school', mandal: '', capacity: '', plant_model: '', unit_number: '', amc_status: 'amc' })
    setEditId(null); setStampFile(null); setStampPreview(null); setExistingStamp(null); setModal(true)
  }
  function openEdit(s) {
    setForm({ name: s.name, client_id: s.client_id || '', model: s.model || 'school', mandal: s.mandal_name || '', capacity: s.capacity || '', plant_model: s.plant_model || '', unit_number: s.unit_number || '', amc_status: s.amc_status || 'amc' })
    setEditId(s.id); setStampFile(null); setStampPreview(null); setExistingStamp(null)
    // Check if stamp already uploaded
    api.get(`/api/schools/${s.id}/stamp`).then(r => {
      if (r.data.ok) setExistingStamp(r.data.stamp_url)
    }).catch(() => {})
    setModal(true)
  }

  function onStampChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setStampFile(file)
    setStampPreview(URL.createObjectURL(file))
  }

  async function save(ev) {
    ev.preventDefault()
    // For edit, stamp is mandatory if no existing stamp
    if (editId && !existingStamp && !stampFile) {
      showToast('⚠️ School stamp is required! Upload stamp image first.')
      stampInputRef.current?.focus()
      return
    }
    setStampSaving(true)
    const payload = { ...form, client_id: form.client_id ? parseInt(form.client_id) : null }
    let savedId = editId
    if (editId) {
      await api.put(`/api/schools/${editId}`, payload)
    } else {
      const res = await api.post('/api/schools/', payload)
      savedId = res.data.id
    }
    // Upload stamp if selected
    if (stampFile && savedId) {
      const fd = new FormData()
      fd.append('file', stampFile)
      await api.post(`/api/schools/${savedId}/stamp`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    setStampSaving(false)
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
        <select value={mandalFilter} onChange={e => { setMandalFilter(e.target.value); setTechFilter(''); setPage(1) }}>
          <option value="">All Mandals</option>
          {mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={techFilter} onChange={e => { setTechFilter(e.target.value); setMandalFilter(''); setPage(1) }}>
          <option value="">All Technicians</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.employee_code})</option>)}
        </select>
      </div>
      <div className="card">
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap scroll-table">
            <table>
              <thead>
                <tr><th>#</th><th>Site Name</th><th>Unit</th><th>Segment</th><th>Contract</th><th>Mandal</th><th>Technician</th><th>Last Visit</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.items.map((s, i) => (
                  <tr key={s.id}>
                    <td>{(page - 1) * 50 + i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td><span className="pill pill-blue">{s.unit_number ? `Unit ${s.unit_number}` : '—'}</span></td>
                    <td><span className={`pill ${s.model === 'temple' ? 'pill-orange' : 'pill-blue'}`}>{s.model || '—'}</span></td>
                    <td><span className={`pill ${s.amc_status === 'amc' ? 'pill-green' : s.amc_status === 'warranty' ? 'pill-orange' : 'pill-red'}`}>{(s.amc_status || '—').toUpperCase()}</span></td>
                    <td>{s.mandal_name || '—'}</td>
                    <td>{s.technician_name || '—'}</td>
                    <td>{s.last_visit_date || '—'}</td>
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
                <div className="form-group"><label>Unit (State)</label>
                  <select value={form.unit_number} onChange={f('unit_number')}>
                    <option value="">— Select Unit —</option>
                    <option value="1">Unit 1 — Telangana</option>
                    <option value="2">Unit 2 — Andhra Pradesh</option>
                    <option value="3">Unit 3 — Other States</option>
                  </select>
                </div>
                <div className="form-group"><label>Segment / Type</label>
                  <select value={form.model} onChange={f('model')}>
                    <option value="school">School</option>
                    <option value="hospital">Hospital</option>
                    <option value="temple">Temple</option>
                    <option value="park">Park</option>
                    <option value="village">Village</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group"><label>Contract Type</label>
                  <select value={form.amc_status} onChange={f('amc_status')}>
                    <option value="amc">AMC</option>
                    <option value="warranty">Warranty</option>
                    <option value="chargeable">Chargeable</option>
                    <option value="others">Others</option>
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

              {/* Stamp upload — mandatory on edit */}
              {editId && (
                <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: `2px solid ${existingStamp || stampPreview ? 'var(--green)' : 'var(--red)'}`, background: existingStamp || stampPreview ? 'rgba(52,211,153,.05)' : 'rgba(248,113,113,.05)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🔏 School Stamp <span style={{ color: 'var(--red)', fontSize: 11 }}>* Required</span></span>
                    {(existingStamp || stampPreview) && <span style={{ color: 'var(--green)', fontSize: 11 }}>✅ Stamp on file</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {(stampPreview || existingStamp) && (
                      <img src={stampPreview || existingStamp} alt="stamp"
                        style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 4 }} />
                    )}
                    <div>
                      <input ref={stampInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={onStampChange} />
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => stampInputRef.current?.click()}>
                        {existingStamp || stampPreview ? '🔄 Replace Stamp' : '📤 Upload Stamp'}
                      </button>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>PNG or JPG · Will appear on service report PDFs</div>
                    </div>
                  </div>
                  {!existingStamp && !stampPreview && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>⚠️ Upload the school's official stamp — required before saving</div>
                  )}
                </div>
              )}

              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary" disabled={stampSaving}>
                  {stampSaving ? 'Saving…' : 'Save Site'}
                </button>
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
