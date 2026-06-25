import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

export default function DeskTasks() {
  const { user } = useAuthStore()
  const [employees, setEmployees] = useState([])
  const [tasks, setTasks] = useState([])
  const [rotationMap, setRotationMap] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [filterEmp, setFilterEmp] = useState('')
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [taskDate, setTaskDate] = useState(today)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  function load() {
    Promise.all([
      api.get('/api/employees/'),
      api.get('/api/tasks/', { params: { task_date: taskDate, ...(filterEmp ? { employee_id: filterEmp } : {}) } })
    ]).then(([e, t]) => {
      const techs = e.data.filter(emp => emp.role === 'technician')
      setEmployees(techs)
      setTasks(t.data)
      // Load rotation info for each technician
      Promise.all(techs.map(emp =>
        api.get('/api/tasks/suggested-schools', { params: { employee_id: emp.id, task_date: taskDate } })
          .then(r => ({ id: emp.id, data: r.data }))
          .catch(() => ({ id: emp.id, data: null }))
      )).then(results => {
        const map = {}
        results.forEach(r => { map[r.id] = r.data })
        setRotationMap(map)
      })
    })
  }

  useEffect(() => { load() }, [taskDate, filterEmp])

  async function generateDaily() {
    setGenerating(true)
    try {
      const r = await api.post('/api/tasks/generate-daily', null, { params: { task_date: taskDate } })
      const generated = r.data.results.reduce((s, x) => s + (x.generated || 0), 0)
      const skipped = r.data.results.filter(x => x.skipped).length
      showToast(`✅ Generated ${generated} tasks for ${r.data.processed} technicians (${skipped} already had tasks)`)
      load()
    } catch (e) {
      showToast('❌ Failed to generate tasks')
    }
    setGenerating(false)
  }

  async function deleteTask(id, title, assigneeName) {
    if (!confirm(`Delete task "${title}" assigned to ${assigneeName}?`)) return
    await api.delete(`/api/tasks/${id}`)
    load()
    showToast('Task deleted')
  }

  const grouped = {}
  employees.forEach(e => { grouped[e.id] = { emp: e, tasks: [] } })
  tasks.forEach(t => {
    if (grouped[t.assigned_to_id]) grouped[t.assigned_to_id].tasks.push(t)
  })

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📋 Task Assignment</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ background: 'var(--green)', fontSize: 12 }}
            onClick={generateDaily} disabled={generating}>
            {generating ? '⏳ Generating…' : '⚡ Generate Daily Tasks (5 each)'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Assign Task</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
        </select>
        <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => {
          api.post('/api/tasks/auto-attendance', null, { params: { task_date: taskDate } })
            .then(r => showToast(`✅ Attendance calculated for ${r.data.processed} employees`))
        }}>📅 Auto Attendance</button>
      </div>

      {/* Employee task boards */}
      {Object.values(grouped)
        .filter(g => !filterEmp || String(g.emp.id) === String(filterEmp))
        .map(({ emp, tasks: empTasks }) => {
          const done = empTasks.filter(t => t.status === 'completed').length
          const over5 = empTasks.length > 5
          const over7 = empTasks.length >= 7
          const rot = rotationMap[emp.id]
          const rotPct = rot?.total_schools > 0 ? Math.round((rot.visited_count / rot.total_schools) * 100) : 0
          return (
            <div key={emp.id} style={{
              background: 'var(--surface)', border: `1px solid ${over7 ? 'var(--red)' : over5 ? 'var(--yellow)' : 'var(--border)'}`,
              borderRadius: 12, padding: 16, marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{emp.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>[{emp.employee_code}]</span>
                  {over7 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>🚫 MAX REACHED</span>}
                  {over5 && !over7 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--yellow)', fontWeight: 700 }}>⚠️ Over 5</span>}
                </div>
                <div style={{ fontSize: 12, color: done === empTasks.length && empTasks.length > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {done}/{empTasks.length} done today
                </div>
              </div>

              {/* Rotation progress */}
              {rot && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                      🔄 Round progress — {rot.visited_count}/{rot.total_schools} schools visited
                    </span>
                    <span style={{
                      fontWeight: 700, fontSize: 10, padding: '1px 7px', borderRadius: 5,
                      background: rot.new_round ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.15)',
                      color: rot.new_round ? 'var(--green)' : 'var(--yellow)'
                    }}>{rot.new_round ? '🔁 New round' : `${rot.unvisited_count} remaining`}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${rotPct}%`, background: rot.new_round ? 'var(--green)' : 'var(--accent)', borderRadius: 3, transition: 'width .4s' }} />
                  </div>
                </div>
              )}

              {empTasks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No tasks assigned for this date.</div>
              ) : (
                empTasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 6
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</span>
                      {t.school_name && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>🏫 {t.school_name}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: t.status === 'completed' ? 'rgba(52,211,153,.2)' : 'rgba(251,191,36,.2)',
                        color: t.status === 'completed' ? 'var(--green)' : 'var(--yellow)' }}>
                        {t.status}
                      </span>
                      <button onClick={() => deleteTask(t.id, t.title, emp.name)} style={{
                        background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14
                      }}>🗑️</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}

      {showForm && (
        <AssignTaskModal
          employees={employees}
          onClose={() => setShowForm(false)}
          onSaved={() => { load(); showToast('✅ Task assigned!') }}
          defaultDate={taskDate}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function AssignTaskModal({ employees, onClose, onSaved, defaultDate }) {
  const [empId, setEmpId] = useState('')
  const [schools, setSchools] = useState([])
  const [suggested, setSuggested] = useState({ schools: [], new_round: false, total_in_mandal: 0, eligible_count: 0 })
  const [form, setForm] = useState({ title: '', school_id: '', priority: 'medium', due_date: defaultDate, description: '' })
  const [dailyCount, setDailyCount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!empId) return
    api.get('/api/schools/', { params: { limit: 300 } }).then(r => setSchools(r.data?.items || []))
    api.get('/api/tasks/daily-count', { params: { employee_id: empId, task_date: form.due_date } })
      .then(r => setDailyCount(r.data))
    api.get('/api/tasks/suggested-schools', { params: { employee_id: empId, task_date: form.due_date } })
      .then(r => setSuggested(r.data))
  }, [empId, form.due_date])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    if (!empId || !form.title.trim()) { setError('Select employee and enter title'); return }
    if (dailyCount && !dailyCount.can_add) { setError(`Daily max (7 tasks) reached for this employee on ${form.due_date}`); return }
    setLoading(true); setError('')
    try {
      const r = await api.post('/api/tasks/', {
        title: form.title, description: form.description,
        assigned_to_id: Number(empId),
        school_id: form.school_id ? Number(form.school_id) : null,
        priority: form.priority, due_date: form.due_date
      })
      if (r.data.warning) setError(r.data.warning) // soft warning
      onSaved(); onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to assign task')
    }
    setLoading(false)
  }

  const emp = employees.find(e => String(e.id) === String(empId))
  // Use rotation-eligible schools for the dropdown (enforced by backend too)
  const eligibleSchoolIds = new Set(suggested.schools.map(s => s.id))
  const mandalSchools = emp?.mandal_id
    ? schools.filter(s => s.mandal_id === emp.mandal_id && (eligibleSchoolIds.size === 0 || eligibleSchoolIds.has(s.id)))
    : schools

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📋 Assign Task</h3>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Assign To *</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>

        {/* Daily cap indicator */}
        {dailyCount && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12,
            background: !dailyCount.can_add ? 'rgba(248,113,113,.1)' : dailyCount.count >= 5 ? 'rgba(251,191,36,.1)' : 'rgba(52,211,153,.1)',
            border: `1px solid ${!dailyCount.can_add ? 'var(--red)' : dailyCount.count >= 5 ? 'var(--yellow)' : 'var(--green)'}`,
            color: !dailyCount.can_add ? 'var(--red)' : dailyCount.count >= 5 ? 'var(--yellow)' : 'var(--green)'
          }}>
            {!dailyCount.can_add
              ? `🚫 Daily max reached (${dailyCount.count}/7 tasks)`
              : `📋 ${dailyCount.count}/${dailyCount.max_limit} tasks assigned${dailyCount.count >= 5 ? ' — over default (5)' : ''}`}
          </div>
        )}

        {/* Rotation status + suggested schools */}
        {empId && suggested.total_in_mandal > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                🔄 Mandal rotation — {suggested.eligible_count}/{suggested.total_in_mandal} eligible
              </span>
              {suggested.new_round
                ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(52,211,153,.15)', color: 'var(--green)', fontWeight: 700 }}>New round</span>
                : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(251,191,36,.15)', color: 'var(--yellow)', fontWeight: 700 }}>
                    {suggested.total_in_mandal - suggested.eligible_count} visited — visit remaining first
                  </span>
              }
            </div>
            {suggested.schools.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'rgba(248,113,113,.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,.3)' }}>
                ⚠️ No eligible schools for rotation in this mandal today.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {suggested.schools.map(s => (
                  <button key={s.id} onClick={() => { set('school_id', String(s.id)); set('title', `Visit ${s.name}`) }}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                      background: String(form.school_id) === String(s.id) ? 'rgba(56,189,248,.2)' : 'var(--surface2)',
                      border: `1px solid ${String(form.school_id) === String(s.id) ? 'var(--accent)' : 'var(--border)'}`,
                      color: String(form.school_id) === String(s.id) ? 'var(--accent)' : 'var(--text)'
                    }}>
                    🏫 {s.name}
                    {s.last_visit_date
                      ? <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({s.last_visit_date})</span>
                      : <span style={{ color: 'var(--yellow)', marginLeft: 4, fontWeight: 700 }}>(never visited)</span>
                    }
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Task Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Visit Nalgonda PS, Repair pump…" />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>School (optional)</label>
            <select value={form.school_id} onChange={e => set('school_id', e.target.value)}>
              <option value="">Select school…</option>
              {mandalSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Priority</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Description</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional notes…" />
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading || (dailyCount && !dailyCount.can_add)}>
            {loading ? '⏳ Assigning…' : '✅ Assign Task'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
