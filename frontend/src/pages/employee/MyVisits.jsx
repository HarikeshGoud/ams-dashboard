import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import ProofUploadModal from './ProofUploadModal'

function StartVisitModal({ onClose, onStarted, employeeId }) {
  const today = new Date().toISOString().slice(0, 10)
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/schools/?limit=300').then(r => setSchools(r.data?.items || r.data || []))
  }, [])

  async function start() {
    if (!schoolId) { setError('Select a school'); return }
    const school = schools.find(s => String(s.id) === schoolId)
    setLoading(true); setError('')
    try {
      const res = await api.post('/api/tasks/', {
        title: `Visit ${school?.name || ''}`,
        description: note || 'Manually logged visit',
        assigned_to_id: employeeId,
        school_id: Number(schoolId),
        priority: 'medium',
        due_date: today,
      })
      onStarted(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to start visit')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🏫 Start a Visit</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Proof photos and a signed service report are required to complete this visit — same as your assigned tasks.
        </p>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>School *</label>
          <select value={schoolId} onChange={e => setSchoolId(e.target.value)}>
            <option value="">Select school…</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Reason (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Follow-up complaint, extra visit…" />
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={start} disabled={loading}>
            {loading ? '⏳ Starting…' : '📸 Start Visit & Submit Proof'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function MyVisits() {
  const { user } = useAuthStore()
  const [reports, setReports] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [activeTask, setActiveTask] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/api/field-reports/'),
      api.get('/api/tasks/my-tasks/all'),
    ]).then(([r, t]) => {
      setReports(r.data)
      setTasks(t.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function resumeServiceReport(r) {
    const task = tasks.find(t => t.id === r.task_id)
    if (task) setActiveTask({ ...task, _resumeStep3: true, _fieldReportId: r.id })
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🏫 My Visits</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{reports.length} logged</span>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setPicking(true)}>
            + Log Visit
          </button>
        </div>
      </div>

      {loading ? <div className="spinner" /> : reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏫</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No visits logged</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Log a visit — proof photos and a service report will be required to complete it</div>
          <button className="btn btn-primary" onClick={() => setPicking(true)}>+ Log First Visit</button>
        </div>
      ) : (
        reports.map(r => {
          const vs = r.verification_status || 'pending'
          const vsConfig = {
            pending:  { label: '⏳ Awaiting school confirmation', color: 'var(--yellow)',  bg: 'rgba(251,191,36,.1)' },
            verified: { label: '✅ Confirmed by school',          color: 'var(--green)',   bg: 'rgba(52,211,153,.12)' },
            rejected: { label: '❌ Rejected by school',           color: 'var(--red)',     bg: 'rgba(248,113,113,.12)' },
          }[vs]
          return (
            <div key={r.id} style={{ background: 'var(--surface)', border: `1px solid ${r.has_service_report ? vsConfig.color : 'var(--red)'}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>🏫 {r.school_name || `School #${r.school_id}`}</div>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>📅 {r.report_date}</span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {!r.has_service_report && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                    ⚠️ Service Report Pending
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: vsConfig.bg, color: vsConfig.color, border: `1px solid ${vsConfig.color}` }}>
                  {vsConfig.label}
                </span>
              </div>

              {!r.has_service_report && r.task_id && (
                <div style={{ marginBottom: 8 }}>
                  <button onClick={() => resumeServiceReport(r)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer' }}>
                    📋 Complete Service Report
                  </button>
                </div>
              )}

              {r.item_installed && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>🔧 {r.item_installed}</div>}

              {r.photos?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {r.photos.map(p => (
                    <div key={p.id} style={{ position: 'relative' }}>
                      <img src={p.url} alt={p.photo_type}
                        style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: '0 0 8px 8px' }}>
                        {p.photo_type.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {r.remarks && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>💬 {r.remarks}</div>}
            </div>
          )
        })
      )}

      {picking && (
        <StartVisitModal
          employeeId={user?.id}
          onClose={() => setPicking(false)}
          onStarted={(task) => { setPicking(false); setActiveTask(task) }}
        />
      )}

      {activeTask && (
        <ProofUploadModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSubmitted={() => { setActiveTask(null); load(); showToast('✅ Visit submitted!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
