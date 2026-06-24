import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', assigned_to_id: '', priority: 'medium', due_date: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/tasks/'), api.get('/api/employees/')]).then(([t, e]) => {
      setTasks(t.data); setEmployees(e.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function save(ev) {
    ev.preventDefault()
    await api.post('/api/tasks/', { ...form, assigned_to_id: parseInt(form.assigned_to_id) })
    load(); setModal(false); showToast('Task created!')
  }

  async function updateStatus(id, status) {
    await api.patch(`/api/tasks/${id}/status?status=${status}`)
    load()
  }

  async function del(id) {
    if (!confirm('Delete task?')) return
    await api.delete(`/api/tasks/${id}`)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const priorityPill = { low: 'pill-blue', medium: 'pill-yellow', high: 'pill-red' }
  const statusPill = { pending: 'pill-yellow', in_progress: 'pill-orange', completed: 'pill-green', cancelled: 'pill-gray' }

  const grouped = {
    pending: tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed: tasks.filter(t => t.status === 'completed'),
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>✅ Tasks</h3>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Create Task</button>
      </div>

      <div className="grid-3">
        {Object.entries(grouped).map(([status, list]) => (
          <div key={status} className="card">
            <div className="card-title" style={{ textTransform: 'capitalize' }}>
              {status.replace('_', ' ')} <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{list.length}</span>
            </div>
            {list.map(t => (
              <div key={t.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                  👤 {t.assigned_to_name} {t.due_date && `· Due: ${t.due_date}`}
                </div>
                <div className="flex gap-8 items-center">
                  <span className={`pill ${priorityPill[t.priority] || 'pill-gray'}`} style={{ fontSize: 10 }}>{t.priority}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {status === 'pending'     && <button className="btn btn-outline btn-sm" onClick={() => updateStatus(t.id, 'in_progress')}>Start</button>}
                    {status === 'in_progress' && <button className="btn btn-green btn-sm"   onClick={() => updateStatus(t.id, 'completed')}>Done</button>}
                    <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>×</button>
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 12 }}>Empty</div>}
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Create Task</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Title *</label><input required value={form.title} onChange={f('title')} /></div>
                <div className="form-group form-full"><label>Description</label><textarea value={form.description} onChange={f('description')} /></div>
                <div className="form-group"><label>Assign To *</label>
                  <select required value={form.assigned_to_id} onChange={f('assigned_to_id')}>
                    <option value="">Select...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Priority</label>
                  <select value={form.priority} onChange={f('priority')}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div className="form-group form-full"><label>Due Date</label><input type="date" value={form.due_date} onChange={f('due_date')} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Create</button>
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
