import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'
import { formatISTDate } from '../utils/istTime'

export default function Complaints() {
  const [complaints, setComplaints] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ school_id: '', reported_by: '', phone: '', issue_type: '', description: '', priority: 'medium' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/complaints/'), api.get('/api/schools/?limit=200')]).then(([c, s]) => {
      setComplaints(c.data); setSchools(s.data.items); setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function save(ev) {
    ev.preventDefault()
    if (!form.school_id) { showToast('❌ Select a school'); return }
    await api.post('/api/complaints/', { ...form, school_id: parseInt(form.school_id) })
    load(); setModal(false); showToast('Complaint raised!')
  }

  async function resolve(id) {
    await api.patch(`/api/complaints/${id}/resolve`)
    load(); showToast('Resolved!')
  }

  async function del(id) {
    if (!confirm('Delete?')) return
    await api.delete(`/api/complaints/${id}`)
    setComplaints(complaints.filter(c => c.id !== id))
  }

  if (loading) return <div className="spinner" />

  const priorityPill = { low: 'pill-blue', medium: 'pill-yellow', high: 'pill-orange', urgent: 'pill-red' }
  const statusPill   = { open: 'pill-red', assigned: 'pill-yellow', in_progress: 'pill-orange', resolved: 'pill-green', closed: 'pill-gray' }

  return (
    <div>
      <div className="section-header">
        <h3>🔴 Complaints <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>({complaints.filter(c => c.status === 'open').length} open)</span></h3>
        <button className="btn btn-danger" onClick={() => setModal(true)}>+ Raise Complaint</button>
      </div>
      <div className="card">
        <div className="table-wrap scroll-table">
          <table>
            <thead>
              <tr><th>School</th><th>Issue</th><th>Reported By</th><th>Priority</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c.id}>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.school_name}</td>
                  <td>{c.issue_type || c.description?.slice(0,40) || '—'}</td>
                  <td>{c.reported_by || '—'}</td>
                  <td><span className={`pill ${priorityPill[c.priority] || 'pill-gray'}`}>{c.priority}</span></td>
                  <td><span className={`pill ${statusPill[c.status] || 'pill-gray'}`}>{c.status}</span></td>
                  <td>{formatISTDate(c.reported_at)}</td>
                  <td>
                    {c.status !== 'resolved' && <button className="btn btn-green btn-sm" onClick={() => resolve(c.id)}>Resolve</button>}{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>Del</button>
                  </td>
                </tr>
              ))}
              {complaints.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>No complaints</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Raise Complaint</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>School *</label>
                  <SearchableSelect value={form.school_id} onChange={val => setForm({ ...form, school_id: val })}
                    placeholder="Select…" options={schools.map(s => ({ value: String(s.id), label: s.name }))} />
                </div>
                <div className="form-group"><label>Reported By</label><input value={form.reported_by} onChange={f('reported_by')} /></div>
                <div className="form-group"><label>Phone</label><input value={form.phone} onChange={f('phone')} /></div>
                <div className="form-group"><label>Issue Type</label><input value={form.issue_type} onChange={f('issue_type')} placeholder="e.g. No Water" /></div>
                <div className="form-group"><label>Priority</label>
                  <select value={form.priority} onChange={f('priority')}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="form-group form-full"><label>Description</label><textarea value={form.description} onChange={f('description')} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-danger">Submit Complaint</button>
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
