import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import ProofUploadModal from './ProofUploadModal'
import { useAuthStore } from '../../store/authStore'

export default function EmployeeDashboard() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [submittedToday, setSubmittedToday] = useState([])
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [toast, setToast] = useState('')

  const { user } = useAuthStore()
  const myId = user?.id

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  function load() {
    const todayIso = new Date().toISOString().slice(0, 10)
    Promise.all([
      api.get('/api/tasks/my-tasks'),
      api.get('/api/field-reports/'),
      api.get('/api/attendance/', { params: { employee_id: myId } })
    ]).then(([t, r, a]) => {
      setTasks(t.data)
      const todayReports = r.data.filter(rp => rp.report_date === todayIso)
      const recentOther = r.data.filter(rp => rp.report_date !== todayIso).slice(0, 5)
      setSubmittedToday([...todayReports, ...recentOther])
      const myToday = a.data.find(rec => rec.date === todayIso) || null
      setTodayAttendance(myToday)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  function handleProofSubmitted() {
    setSelectedTask(null)
    load()
    showToast('✅ Proof submitted! Under review by admin.')
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const overdueCount = tasks.filter(t => t.due_date && t.due_date < todayIso).length
  const todayReports = submittedToday.filter(r => r.report_date === todayIso)
  // accepted = verified by school/admin; submitted = proof uploaded but not yet verified
  const acceptedTaskIds = new Set(submittedToday.filter(r => r.verification_status === 'verified').map(r => r.task_id))
  const submittedTaskIds = new Set(submittedToday.map(r => r.task_id))

  if (loading) return <div className="spinner" />

  return (
    <div>
      {/* Date banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2d42, #0a3d52)',
        border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>📅 Today</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>{today}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>Pending tasks: </span>
            <span style={{ fontWeight: 700, color: tasks.length > 0 ? 'var(--yellow)' : 'var(--green)' }}>{tasks.length}</span>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>Submitted today: </span>
            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{todayReports.length}</span>
          </div>
          {overdueCount > 0 && (
            <div style={{ fontSize: 13 }}>
              <span style={{ background: 'rgba(248,113,113,.15)', color: 'var(--red)', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
                ⚠️ {overdueCount} overdue
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Attendance note */}
      {/* Attendance status — shows real DB record, including admin overrides */}
      {todayAttendance ? (
        todayAttendance.status === 'absent' ? (
          <div className="alert alert-red" style={{ marginBottom: 16 }}>
            <span>❌</span>
            <div>
              <b>Marked Absent today by admin.</b>
              {todayAttendance.notes && (
                <span style={{ marginLeft: 8, fontSize: 12 }}>Reason: <b>{todayAttendance.notes}</b></span>
              )}
            </div>
          </div>
        ) : (
          <div className="alert alert-green" style={{ marginBottom: 16 }}>
            <span>✅</span>
            <div>Attendance: <b>{todayAttendance.status === 'present' ? 'Present' : todayAttendance.status === 'half_day' ? 'Half Day' : todayAttendance.status}</b> — marked by admin. {todayReports.length > 0 && `${todayReports.length} proof${todayReports.length > 1 ? 's' : ''} submitted.`}</div>
          </div>
        )
      ) : todayReports.length > 0 ? (
        <div style={{ background: 'rgba(251,191,36,.1)', border: '1px solid var(--yellow)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>📋</span>
          <div style={{ fontSize: 13 }}>{todayReports.length} proof{todayReports.length > 1 ? 's' : ''} submitted today and under review. <b>Attendance not yet marked</b> — admin will update it.</div>
        </div>
      ) : null}

      {/* Task list */}
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        My Tasks
      </div>

      {tasks.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>All tasks done for today!</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Check back tomorrow for new assignments.</div>
        </div>
      )}

      {tasks.map(task => {
        const accepted  = acceptedTaskIds.has(task.id)
        const submitted = !accepted && submittedTaskIds.has(task.id)
        const overdue   = !accepted && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
        const borderColor = accepted ? 'var(--green)' : submitted ? 'var(--yellow)' : overdue ? 'var(--red)' : 'var(--border)'
        return (
          <div key={task.id} style={{
            background: 'var(--surface)', border: `1px solid ${borderColor}`,
            borderRadius: 12, padding: 16, marginBottom: 12,
            opacity: accepted ? 0.7 : 1
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{task.title}</div>
                {task.school_mandal && (
                  <div style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 4 }}>📍 {task.school_mandal}</div>
                )}
                {task.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{task.description}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                  {!accepted && task.due_date && (
                    <span style={{ color: overdue ? 'var(--red)' : 'var(--muted)' }}>
                      {overdue ? '⚠️ Due: ' : '📅 Due: '}{task.due_date}
                    </span>
                  )}
                  <span className={`pill ${task.priority === 'high' ? 'pill-red' : task.priority === 'medium' ? 'pill-yellow' : 'pill-blue'}`}>
                    {task.priority}
                  </span>
                </div>
              </div>
              {accepted ? (
                <span style={{ background: 'rgba(52,211,153,.15)', color: 'var(--green)', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  ✅ Accepted
                </span>
              ) : submitted ? (
                <span style={{ background: 'rgba(251,191,36,.12)', color: 'var(--yellow)', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  ⏳ Under Review
                </span>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ flexShrink: 0, marginLeft: 12 }}
                  onClick={() => setSelectedTask(task)}
                >
                  📸 Submit Proof
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Today's submissions */}
      {submittedToday.length > 0 && (
        <div>
          <div style={{ marginTop: 24, marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            My Submissions &amp; Verification Status
          </div>
          {submittedToday.map(r => {
            const vs = r.verification_status || 'pending'
            const vsConfig = {
              pending:  { label: '⏳ Awaiting school confirmation', color: 'var(--yellow)',  bg: 'rgba(251,191,36,.1)' },
              verified: { label: '✅ Confirmed by school',          color: 'var(--green)',   bg: 'rgba(52,211,153,.12)' },
              rejected: { label: '❌ Rejected by school',           color: 'var(--red)',     bg: 'rgba(248,113,113,.12)' },
            }[vs]
            return (
            <div key={r.id} style={{ background: 'var(--surface2)', border: `1px solid ${r.has_service_report ? vsConfig.color : 'var(--red)'}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {r.item_installed || 'Field Report'} — {r.report_date}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="pill pill-green">Submitted</span>
                  {!r.has_service_report && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                      ⚠️ Service Report Pending
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                    background: vsConfig.bg, color: vsConfig.color, border: `1px solid ${vsConfig.color}`
                  }}>{vsConfig.label}</span>
                </div>
              </div>
              {!r.has_service_report && r.task_id && (
                <div style={{ marginBottom: 8 }}>
                  <button onClick={() => {
                    const task = tasks.find(t => t.id === r.task_id)
                    if (task) setSelectedTask({ ...task, _resumeStep3: true, _fieldReportId: r.id })
                  }} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer' }}>
                    📋 Complete Service Report
                  </button>
                </div>
              )}
              {r.verification_note && (
                <div style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, marginBottom: 8, background: vsConfig.bg, color: vsConfig.color }}>
                  📝 {r.verification_note}
                </div>
              )}
              {r.latitude && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  📍 GPS: {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.photos.map(p => (
                  <div key={p.id} style={{ position: 'relative' }}>
                    <img src={p.url} alt={p.photo_type}
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                    <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: '0 0 8px 8px' }}>
                      {p.photo_type.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
              {r.remarks && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>💬 {r.remarks}</div>}
            </div>
          )})}

        </div>
      )}

      {selectedTask && (
        <ProofUploadModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSubmitted={handleProofSubmitted}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
