import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', contact_name: '', contact_phone: '', contact_email: '', gst_no: '', address: '', notes: '', amc_start: '', amc_end: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  useEffect(() => { api.get('/api/clients/').then(r => { setClients(r.data); setLoading(false) }) }, [])

  function openAdd() { setForm({ name: '', contact_name: '', contact_phone: '', contact_email: '', gst_no: '', address: '', notes: '', amc_start: '', amc_end: '' }); setEditId(null); setModal(true) }
  function openEdit(c) {
    setForm({ name: c.name, contact_name: c.contact_person || '', contact_phone: c.phone || '', contact_email: c.email || '', gst_no: c.gst_no || '', address: c.address || '', notes: c.notes || '', amc_start: c.amc_start ? c.amc_start.slice(0,10) : '', amc_end: c.amc_end ? c.amc_end.slice(0,10) : '' })
    setEditId(c.id); setModal(true)
  }

  async function save(ev) {
    ev.preventDefault()
    if (editId) await api.put(`/api/clients/${editId}`, form)
    else await api.post('/api/clients/', form)
    const r = await api.get('/api/clients/')
    setClients(r.data); setModal(false); showToast(editId ? 'Updated!' : 'Client added!')
  }

  async function del(id) {
    if (!confirm('Delete client?')) return
    await api.delete(`/api/clients/${id}`)
    setClients(clients.filter(c => c.id !== id)); showToast('Deleted')
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>🏢 Clients</h3>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Client</button>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card cyan"><div className="kpi-label">Total Clients</div><div className="kpi-value">{clients.length}</div></div>
        <div className="kpi-card yellow"><div className="kpi-label">Total Sites</div><div className="kpi-value">{clients.reduce((a,c) => a + (c.sites_count||0), 0)}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {clients.map(c => (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <span className="pill pill-green">Active</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>👤 {c.contact_person || '—'} · 📞 {c.phone || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>🏫 {c.sites_count || 0} sites</div>
            {c.amc_end && <div style={{ fontSize: 11, color: 'var(--yellow)' }}>AMC until {c.amc_end.slice(0,10)}</div>}
            <div className="flex gap-8 mt-16">
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>Delete</button>
            </div>
          </div>
        ))}
        {clients.length === 0 && <div style={{ color: 'var(--muted)', padding: 24 }}>No clients yet. Add one!</div>}
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editId ? 'Edit Client' : '+ Add Client'}</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Name *</label><input required value={form.name} onChange={f('name')} /></div>
                <div className="form-group"><label>Contact Person</label><input value={form.contact_name} onChange={f('contact_name')} /></div>
                <div className="form-group"><label>Phone</label><input value={form.contact_phone} onChange={f('contact_phone')} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.contact_email} onChange={f('contact_email')} /></div>
                <div className="form-group"><label>GST No.</label><input value={form.gst_no} onChange={f('gst_no')} /></div>
                <div className="form-group"><label>AMC Start</label><input type="date" value={form.amc_start} onChange={f('amc_start')} /></div>
                <div className="form-group"><label>AMC End</label><input type="date" value={form.amc_end} onChange={f('amc_end')} /></div>
                <div className="form-group form-full"><label>Address</label><textarea value={form.address} onChange={f('address')} /></div>
                <div className="form-group form-full"><label>Notes</label><input value={form.notes} onChange={f('notes')} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Save Client</button>
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
