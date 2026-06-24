import { useState, useEffect } from 'react'
import api from '../../api/axios'
import ProofUploadModal from './ProofUploadModal'

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

export default function MyTasks() {
  const [tasks, setTasks] = useState([])
  const [fieldReports, setFieldReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [selectedTask, setSelectedTask] = useState(null)
  const [toast, setToast] = useState('')

  function load() {
    Promise.all([
      api.get('/api/tasks/my-tasks/all'),
      api.get('/api/field-reports/')
    ]).then(([t, r]) => {
      setTasks(t.data)
      setFieldReports(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const todayIso = new Date().toISOString().slice(0, 10)

  // A task is "rejected" if its latest field report was rejected
  const rejectedTaskIds = new Set(
    fieldReports
      .filter(r => r.verification_status === 'rejected')
      .map(r => r.task_id)
      .filter(Boolean)
  )

  const active    = tasks.filter(t => t.status !== 'completed')
  const completed = tasks.filter(t => t.status === 'completed')
  const rejected  = tasks.filter(t => rejectedTaskIds.has(t.id))

  const TABS = [
    { key: 'active',    label: '⏳ Active',    count: active.length },
    { key: 'rejected',  label: '❌ Rejected',  count: rejected.length },
    { key: 'completed', label: '✅ Completed', count: completed.length },
  ]

  const displayed = tab === 'active' ? active : tab === 'rejected' ? rejected : completed

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>✅ My Tasks</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{tasks.length} total</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 10, fontSize: 11, fontWeight: 700,
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

      {/* Rejected notice */}
      {tab === 'rejected' && rejected.length > 0 && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <span>⚠️</span>
          <div>These tasks were rejected. You must redo the work and resubmit proof with correct photos.</div>
        </div>
      )}

      {loading ? <div className="spinner" /> : displayed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          {tab === 'active' ? '🎉 No active tasks! Great work.' : tab === 'rejected' ? '✅ No rejected tasks.' : '📋 No completed tasks yet.'}
        </div>
      ) : (
        displayed.map(task => {
          const overdue = task.due_date && task.due_date < todayIso && task.status !== 'completed'
          const isRejected = rejectedTaskIds.has(task.id)

          // Get latest field report for this task
          const latestReport = fieldReports
            .filter(r => r.task_id === task.id)
            .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))[0]

          let borderColor = 'var(--border)'
          if (isRejected) borderColor = 'var(--red)'
          else if (task.status === 'completed') borderColor = 'var(--green)'
          else if (overdue) borderColor = 'rgba(248,113,113,.5)'

          return (
            <div key={task.id} style={{
              background: 'var(--surface)', border: `1px solid ${borderColor}`,
              borderRadius: 10, padding: 14, marginBottom: 12,
              borderLeft: isRejected ? `4px solid var(--red)` : undefined
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                    {isRejected && <span style={{ color: 'var(--red)', marginRight: 6 }}>❌</span>}
                    {task.title}
                  </div>
                  {task.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{task.description}</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    {task.due_date && (
                      <span style={{ color: overdue ? 'var(--red)' : 'var(--muted)' }}>
                        {overdue ? '⚠️ Overdue: ' : '📅 Due: '}{task.due_date}
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
                  {task.status === 'completed' && !isRejected ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, background: 'rgba(52,211,153,.15)', color: 'var(--green)' }}>
                      ✅ Done
                    </span>
                  ) : (
                    <button className="btn btn-primary" style={{
                      fontSize: 12, padding: '6px 12px',
                      background: isRejected ? 'var(--red)' : undefined
                    }}
                      onClick={() => setSelectedTask(task)}>
                      {isRejected ? '🔄 Resubmit' : '📸 Submit'}
                    </button>
                  )}
                </div>
              </div>

              {/* Show rejection reason if this task was rejected */}
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
