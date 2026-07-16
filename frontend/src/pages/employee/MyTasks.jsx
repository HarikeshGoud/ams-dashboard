import { useState, useEffect } from 'react'
import api from '../../api/axios'
import ProofUploadModal from './ProofUploadModal'
import { todayIST } from '../../utils/istTime'

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

export default function MyTasks() {
  const [tasks, setTasks] = useState([])
  const [fieldReports, setFieldReports] = useState([])
  const [rotation, setRotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')
  const [selectedTask, setSelectedTask] = useState(null)
  const [toast, setToast] = useState('')

  const todayIso = todayIST()

  function load() {
    Promise.all([
      api.get('/api/tasks/my-tasks/all'),
      api.get('/api/field-reports/'),
      api.get('/api/tasks/suggested-schools', { params: { task_date: todayIso } })
    ]).then(([t, r, s]) => {
      setTasks(t.data)
      setFieldReports(r.data)
      setRotation(s.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const rejectedTaskIds = new Set(
    fieldReports
      .filter(r => r.verification_status === 'rejected')
      .map(r => r.task_id)
      .filter(Boolean)
  )

  const todayTasks  = tasks.filter(t => t.due_date === todayIso)
  const active      = tasks.filter(t => !['completed','submitted'].includes(t.status) && t.due_date !== todayIso)
  const completed   = tasks.filter(t => t.status === 'completed')
  const underReview = tasks.filter(t => t.status === 'submitted')
  const rejected    = tasks.filter(t => rejectedTaskIds.has(t.id))

  const TABS = [
    { key: 'today',     label: "📅 Today's Visits",  count: todayTasks.length },
    { key: 'review',    label: '🔍 Under Review',     count: underReview.length },
    { key: 'active',    label: '⏳ Other Active',     count: active.length },
    { key: 'rejected',  label: '❌ Rejected',          count: rejected.length },
    { key: 'completed', label: '✅ Verified',          count: completed.length },
  ]

  const displayed = tab === 'today' ? todayTasks : tab === 'review' ? underReview : tab === 'active' ? active : tab === 'rejected' ? rejected : completed

  // Today: submitted + completed both count as "done" for progress dots
  const todayDone  = todayTasks.filter(t => ['completed','submitted'].includes(t.status)).length
  const rotPct     = rotation?.total_schools > 0 ? Math.round((rotation.visited_count / rotation.total_schools) * 100) : 0

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>✅ My Tasks</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tasks.length} total</span>
      </div>

      {/* Today's progress card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>📅 Today's Progress</span>
          <span style={{ fontSize: 12, color: todayDone === 5 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
            {todayDone}/5 visits done
          </span>
        </div>
        {/* Visit progress dots */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {Array.from({ length: 5 }, (_, i) => {
            const t = todayTasks[i]
            const verified  = t?.status === 'completed'
            const submitted = t?.status === 'submitted'
            const rej = t && rejectedTaskIds.has(t.id)
            return (
              <div key={i} style={{
                flex: 1, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: !t ? 'var(--surface2)' : rej ? 'rgba(248,113,113,.15)' : verified ? 'rgba(52,211,153,.15)' : submitted ? 'rgba(251,191,36,.15)' : 'rgba(56,189,248,.1)',
                border: `1px solid ${!t ? 'var(--border)' : rej ? 'var(--red)' : verified ? 'var(--green)' : submitted ? 'var(--yellow)' : 'var(--accent)'}`,
                color: !t ? 'var(--muted)' : rej ? 'var(--red)' : verified ? 'var(--green)' : submitted ? 'var(--yellow)' : 'var(--accent)'
              }}>
                {!t ? `${i+1}` : rej ? '❌' : verified ? '✅' : submitted ? '🔍' : `${i+1}`}
              </div>
            )
          })}
        </div>

        {/* Round rotation progress */}
        {rotation && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>
                🔄 Overall round — {rotation.visited_count}/{rotation.total_schools} schools visited
              </span>
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 5, fontWeight: 700,
                background: rotation.new_round ? 'rgba(52,211,153,.15)' : 'rgba(56,189,248,.15)',
                color: rotation.new_round ? 'var(--green)' : 'var(--accent)'
              }}>
                {rotation.new_round ? '🔁 New round started' : `${rotation.unvisited_count} schools left in round`}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${rotPct}%`, background: rotation.new_round ? 'var(--green)' : 'var(--accent)', borderRadius: 3, transition: 'width .4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flexShrink: 0, padding: '7px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            border: `1.5px solid ${tab === t.key ? (t.key === 'rejected' ? 'var(--red)' : t.key === 'completed' ? 'var(--green)' : 'var(--accent)') : 'var(--border)'}`,
            background: tab === t.key
              ? t.key === 'rejected' ? 'rgba(248,113,113,.12)' : t.key === 'completed' ? 'rgba(52,211,153,.12)' : 'rgba(56,189,248,.12)'
              : 'var(--surface)',
            color: tab === t.key
              ? t.key === 'rejected' ? 'var(--red)' : t.key === 'completed' ? 'var(--green)' : 'var(--accent)'
              : 'var(--muted)'
          }}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === 'rejected' && rejected.length > 0 && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <span>⚠️</span>
          <div>These tasks were rejected. Redo the work and resubmit with correct photos.</div>
        </div>
      )}

      {loading ? <div className="spinner" /> : displayed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          {tab === 'today' ? '⏳ No tasks assigned for today yet. Check back soon.' :
           tab === 'active' ? '🎉 No other active tasks.' :
           tab === 'rejected' ? '✅ No rejected tasks.' : '📋 No completed tasks yet.'}
        </div>
      ) : (
        displayed.map((task, idx) => {
          const overdue = task.due_date && task.due_date < todayIso && task.status !== 'completed'
          const isRejected = rejectedTaskIds.has(task.id)
          const isToday = task.due_date === todayIso

          const latestReport = fieldReports
            .filter(r => r.task_id === task.id)
            .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))[0]

          const isSubmitted = task.status === 'submitted'

          let borderColor = 'var(--border)'
          if (isRejected) borderColor = 'var(--red)'
          else if (task.status === 'completed') borderColor = 'var(--green)'
          else if (isSubmitted) borderColor = 'var(--yellow)'
          else if (overdue) borderColor = 'rgba(248,113,113,.5)'
          else if (isToday) borderColor = 'var(--accent)'

          return (
            <div key={task.id} style={{
              background: 'var(--surface)', border: `1px solid ${borderColor}`,
              borderRadius: 10, padding: 14, marginBottom: 12,
              borderLeft: isRejected ? `4px solid var(--red)` : isToday && tab === 'today' ? `4px solid var(--accent)` : undefined
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {tab === 'today' && <span style={{ fontSize: 11, background: 'rgba(56,189,248,.15)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 5, fontWeight: 800 }}>Visit {idx + 1}</span>}
                    {isRejected && <span style={{ color: 'var(--red)' }}>❌</span>}
                    {task.title}
                  </div>
                  {task.school_name && (
                    <div style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 4 }}>🏫 {task.school_name}</div>
                  )}
                  {task.description && task.description !== 'Daily scheduled visit' && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{task.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    {task.due_date && (
                      <span style={{ color: overdue ? 'var(--red)' : 'var(--muted)' }}>
                        {overdue ? '⚠️ Overdue: ' : '📅 '}{task.due_date}
                      </span>
                    )}
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                      background: `${PRIORITY_COLOR[task.priority] || 'var(--muted)'}22`,
                      color: PRIORITY_COLOR[task.priority] || 'var(--muted)'
                    }}>{task.priority}</span>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {task.status === 'completed' ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, background: 'rgba(52,211,153,.15)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                      ✅ Verified
                    </span>
                  ) : isSubmitted ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, background: 'rgba(251,191,36,.15)', color: 'var(--yellow)', border: '1px solid var(--yellow)' }}>
                      🔍 Under Review
                    </span>
                  ) : (
                    <button className="btn btn-primary" style={{
                      fontSize: 12, padding: '6px 12px',
                      background: isRejected ? 'var(--red)' : undefined
                    }} onClick={() => setSelectedTask(task)}>
                      {isRejected ? '🔄 Resubmit' : '📸 Submit Proof'}
                    </button>
                  )}
                </div>
              </div>

              {isRejected && latestReport?.verification_note && (
                <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.1)', color: 'var(--red)', marginTop: 4 }}>
                  📝 Rejection reason: <b>{latestReport.verification_note}</b>
                </div>
              )}
            </div>
          )
        })
      )}

      {selectedTask && (
        <ProofUploadModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSubmitted={() => { setSelectedTask(null); load(); showToast('✅ Proof submitted!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
