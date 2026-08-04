import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import SearchableSelect from '../../components/SearchableSelect'
import SendSummaryModal from '../../components/SendSummaryModal'
import { buildDailyTaskSummary } from '../../utils/dailySummary'
import { todayIST, formatISTDate, formatISTDateTime } from '../../utils/istTime'

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

// The three Proof Review piles. `badge` is what the card shows; `action` is the decision that
// can still be made from that pile — a verified proof can be pulled back to rejected and a
// rejected one approved, because Reject is a single click and mistakes need an undo.
const PROOF_SECTIONS = [
  { key: 'pending',  label: 'Pending',  icon: '🔍', noun: 'awaiting review',
    color: 'var(--yellow)', bg: 'rgba(251,191,36,.15)',
    badge: '🔍 Pending Review', empty: '✅ Nothing awaiting review' },
  { key: 'verified', label: 'Verified', icon: '✅', noun: 'verified',
    color: 'var(--green)', bg: 'rgba(52,211,153,.15)',
    badge: '✅ Verified', empty: 'No verified proofs' },
  { key: 'rejected', label: 'Rejected', icon: '❌', noun: 'rejected',
    color: 'var(--red)', bg: 'rgba(248,113,113,.15)',
    badge: '❌ Rejected', empty: 'No rejected proofs' },
]
const PROOF_SECTION = Object.fromEntries(PROOF_SECTIONS.map(s => [s.key, s]))

export default function DeskTasks() {
  const { user } = useAuthStore()
  const [mainTab, setMainTab] = useState('tasks') // 'tasks' | 'review'
  const [employees, setEmployees] = useState([])
  const [tasks, setTasks] = useState([])
  const [rotationMap, setRotationMap] = useState({})
  const [fieldReports, setFieldReports] = useState([])
  // Reports for the Proof Review sub-tab currently open — pending, verified or rejected.
  const [proofReports, setProofReports] = useState([])
  // Counts come from the server, not from proofReports.length: the list is capped at 500 and
  // the Verified pile only grows, so counting the rows on screen would quietly under-report.
  const [proofCounts, setProofCounts] = useState({ pending: 0, verified: 0, rejected: 0 })
  const [showForm, setShowForm] = useState(false)
  const [filterEmp, setFilterEmp] = useState('')
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState('')
  const [summaryModal, setSummaryModal] = useState(false)
  const today = todayIST()
  const [taskDate, setTaskDate] = useState(today)
  // Proof Review has its own date/technician filters, independent of the Task Assignment
  // ones above. Defaults to today so the tab opens on the day's work rather than on months
  // of backlog.
  const [proofDate, setProofDate] = useState(today)
  const [proofEmp, setProofEmp]   = useState('')
  // Which of the three piles is on screen. Pending is the default because it's the only one
  // that needs action; the other two are there to look things up and to undo a wrong call.
  const [proofStatus, setProofStatus] = useState('pending')

  // Warnings run longer than confirmations — they're a sentence to read, not a tick to glance at.
  function showToast(msg, ms = 4000) { setToast(msg); setTimeout(() => setToast(''), ms) }

  function load() {
    // Proof Review is scoped server-side: without a date it would return a capped slice of
    // all history, so a pending proof older than the cap could never be reviewed. Blank date
    // means "everything", which is the deliberate opt-out.
    const proofParams = { verification_status: proofStatus, limit: 500 }
    if (proofDate) proofParams.report_date = proofDate
    if (proofEmp)  proofParams.employee_id = proofEmp
    // Counts share the date/technician filters but NOT the status one — the tab badges have to
    // show all three piles while only one of them is being listed.
    const countParams = {}
    if (proofDate) countParams.report_date = proofDate
    if (proofEmp)  countParams.employee_id = proofEmp

    Promise.all([
      api.get('/api/employees/'),
      api.get('/api/tasks/', { params: { task_date: taskDate, ...(filterEmp ? { employee_id: filterEmp } : {}) } }),
      api.get('/api/field-reports/', { params: proofParams }),
      api.get('/api/field-reports/counts', { params: countParams })
        .catch(() => ({ data: null })),   // an older backend just means no badge numbers
    ]).then(([e, t, r, c]) => {
      const techs = e.data.filter(emp => emp.role === 'technician')
      setEmployees(techs)
      setTasks(t.data)
      setFieldReports(r.data)
      // The server already filtered by status; re-filtering here would empty the list on any
      // tab other than Pending.
      setProofReports(r.data)
      if (c.data) setProofCounts(c.data)
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

  useEffect(() => { load() }, [taskDate, filterEmp, proofDate, proofEmp, proofStatus])

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

  async function verifyReport(id, status, note = '') {
    try {
      await api.patch(`/api/field-reports/${id}/verify`, { status, note })
      load()
      showToast(status === 'verified' ? '✅ Proof verified!' : '❌ Proof rejected')
    } catch { showToast('Action failed') }
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
        <h3>📋 Tasks</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mainTab === 'tasks' && <>
            <button className="btn btn-primary" style={{ background: 'var(--green)', fontSize: 12 }}
              onClick={generateDaily} disabled={generating}>
              {generating ? '⏳ Generating…' : '⚡ Generate Daily Tasks (5 each)'}
            </button>
            <button className="btn btn-outline" style={{ fontSize: 12 }}
              onClick={() => setSummaryModal(true)}>
              📤 Send Daily Summary
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Assign Task</button>
          </>}
        </div>
      </div>

      {/* Main tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'tasks',  label: '📋 Task Assignment' },
          // Always the PENDING count, whichever sub-tab is open — it's the number that means
          // "work waiting for you", and it would be misleading for it to track the Verified pile.
          { key: 'review', label: `🔍 Proof Review${proofCounts.pending > 0 ? ` (${proofCounts.pending})` : ''}` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setMainTab(tab.key)} style={{
            padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${mainTab === tab.key ? (tab.key === 'review' && proofCounts.pending > 0 ? 'var(--yellow)' : 'var(--accent)') : 'var(--border)'}`,
            background: mainTab === tab.key ? (tab.key === 'review' && proofCounts.pending > 0 ? 'rgba(251,191,36,.15)' : 'rgba(34,211,238,.15)') : 'var(--surface2)',
            color: mainTab === tab.key ? (tab.key === 'review' && proofCounts.pending > 0 ? 'var(--yellow)' : 'var(--accent)') : 'var(--muted)',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── PROOF REVIEW TAB ── */}
      {mainTab === 'review' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={proofDate} onChange={e => setProofDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                       background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
            <SearchableSelect
              value={proofEmp} onChange={setProofEmp} placeholder="All technicians"
              options={employees.map(e => ({ value: String(e.id), label: `${e.name} [${e.employee_code}]` }))}
              style={{ minWidth: 210 }}
            />
            {proofDate !== today && (
              <button className="btn btn-outline btn-sm" onClick={() => setProofDate(today)}>Today</button>
            )}
            {(proofDate || proofEmp) && (
              <button className="btn btn-outline btn-sm"
                onClick={() => { setProofDate(''); setProofEmp('') }}>Show all dates</button>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {proofReports.length} {PROOF_SECTIONS.find(s => s.key === proofStatus).noun}
              {proofDate ? ` on ${proofDate}` : ' — all dates'}
              {proofEmp ? ` · ${employees.find(e => String(e.id) === String(proofEmp))?.name || ''}` : ''}
            </span>
          </div>

          {/* Pending / Verified / Rejected. Each is a separate server-side query rather than a
              client filter, so the 500-row cap applies per pile instead of being eaten by
              whichever one happens to be largest. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {PROOF_SECTIONS.map(s => {
              const on = proofStatus === s.key
              return (
                <button key={s.key} onClick={() => setProofStatus(s.key)} style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer', border: `1.5px solid ${on ? s.color : 'var(--border)'}`,
                  background: on ? s.bg : 'var(--surface2)',
                  color: on ? s.color : 'var(--muted)',
                }}>
                  {s.icon} {s.label} ({proofCounts[s.key] ?? 0})
                </button>
              )
            })}
          </div>

          {proofReports.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              {proofDate || proofEmp ? (
                <>
                  {PROOF_SECTIONS.find(s => s.key === proofStatus).empty}
                  {proofDate ? ` on ${proofDate}` : ''}{proofEmp ? ' for that technician' : ''}.
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Older proofs are still there — clear the filters with <b>Show all dates</b>.
                  </div>
                </>
              ) : <>{PROOF_SECTIONS.find(s => s.key === proofStatus).empty}.</>}
            </div>
          ) : (
            proofReports.map(report => (
              <ProofReviewCard key={report.id} report={report} onVerify={verifyReport} />
            ))
          )}
        </div>
      )}

      {/* ── TASK ASSIGNMENT TAB ── */}
      {mainTab === 'tasks' && <>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        <SearchableSelect
          value={filterEmp}
          onChange={setFilterEmp}
          placeholder="All Employees"
          options={employees.map(e => ({ value: String(e.id), label: `${e.name} [${e.employee_code}]` }))}
          style={{ minWidth: 200 }}
        />
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
          onSaved={(note) => {
            load()
            note ? showToast(`⚠️ Assigned — ${note}`, 10000) : showToast('✅ Task assigned!')
          }}
          defaultDate={taskDate}
        />
      )}
      </>}

      {summaryModal && (
        <SendSummaryModal
          summary={buildDailyTaskSummary(taskDate, tasks, employees, fieldReports)}
          onClose={() => setSummaryModal(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── Proof Review Card ─────────────────────────────────────────────────────────
function ProofReviewCard({ report, onVerify }) {
  const [rejectNote, setRejectNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Colour and badge follow the report's own status rather than the open tab, so a card that
  // has just been approved reads as approved for the moment before the list reloads.
  const sec = PROOF_SECTION[report.verification_status] || PROOF_SECTION.pending
  const isPending = (report.verification_status || 'pending') === 'pending'

  // Changing a decision that's already been made is not cosmetic: the same endpoint flips the
  // technician's attendance for that day and reopens or closes the task, and attendance feeds
  // payout. So a reversal asks first, naming exactly what else moves. A first-time decision
  // doesn't — that's the normal job, and rejecting already has the reason step.
  function decide(status, note) {
    if (!isPending) {
      const who = report.employee_name || `Employee #${report.employee_id}`
      const attendance = status === 'verified' ? 'PRESENT' : 'ABSENT'
      const task = status === 'verified' ? 'close the task' : 'reopen the task'
      if (!confirm(
        `Change this proof from ${report.verification_status} to ${status}?\n\n` +
        `It will also set ${who}'s attendance for ${report.report_date} to ${attendance} ` +
        `and ${task}.`
      )) return
    }
    onVerify(report.id, status, note)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${sec.color}`,
      borderRadius: 12, padding: 16, marginBottom: 14,
      borderLeft: `4px solid ${sec.color}`
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            🏫 {report.school_name || 'Unknown School'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
            {/* employee_name comes off the report's own relationship, so it resolves even for
                someone who has since been deactivated — an id lookup against the active
                employee list would fall back to a bare number for exactly those people. */}
            👤 {report.employee_name || `Employee #${report.employee_id}`}
            {report.employee_code ? ` [${report.employee_code}]` : ''} · 📅 {report.report_date}
          </div>
          {report.item_installed && (
            <div style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 2 }}>
              🔧 Items: <b>{report.item_installed}</b>
            </div>
          )}
          {report.latitude && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              📍 GPS: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 6, fontWeight: 700, background: sec.bg, color: sec.color, border: `1px solid ${sec.color}`, flexShrink: 0 }}>
          {sec.badge}
        </span>
      </div>

      {/* Photos */}
      {report.photos?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
            Photos ({report.photos.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {(expanded ? report.photos : report.photos.slice(0, 4)).map(p => (
              <div key={p.id} style={{ position: 'relative' }}>
                <img src={p.url} alt={p.photo_type}
                  style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => window.open(p.url, '_blank')}
                  onError={e => { e.target.style.display = 'none' }}
                />
                <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: '0 0 8px 8px', padding: '2px 0' }}>
                  {p.photo_type.toUpperCase()}
                </div>
              </div>
            ))}
            {!expanded && report.photos.length > 4 && (
              <button onClick={() => setExpanded(true)} style={{
                width: 90, height: 90, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer'
              }}>+{report.photos.length - 4} more</button>
            )}
          </div>
        </div>
      )}

      {report.remarks && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>💬 {report.remarks}</div>
      )}

      {/* The decision already on record — the reason and when it was made. This is most of the
          point of the Verified and Rejected piles, and it was never shown before. */}
      {!isPending && (
        <div style={{ fontSize: 12, padding: '8px 11px', borderRadius: 8, marginBottom: 10,
                      background: sec.bg, color: sec.color }}>
          📝 {report.verification_note || <span style={{ opacity: .8 }}>No reason recorded</span>}
          {report.verified_at && (
            <span style={{ marginLeft: 8, opacity: .75 }}>
              — {formatISTDate(report.verified_at)}{' '}
              {formatISTDateTime(report.verified_at, { hour: '2-digit', minute: '2-digit', hour12: true })}
            </span>
          )}
        </div>
      )}

      {/* Reject note input */}
      {showReject && (
        <div style={{ marginBottom: 10 }}>
          <input value={rejectNote} onChange={e => setRejectNote(e.target.value)}
            placeholder="Reason for rejection (shown to technician)…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }}
          />
        </div>
      )}

      {/* Actions. Pending gets the decision; Verified and Rejected get a way to reverse it,
          because Reject is a single click and a mis-click otherwise sticks permanently. */}
      <div style={{ display: 'flex', gap: 8 }}>
        {showReject ? (
          <>
            <button onClick={() => decide('rejected', rejectNote)} style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 13
            }}>❌ Confirm Reject</button>
            <button onClick={() => setShowReject(false)} style={{
              padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12
            }}>Cancel</button>
          </>
        ) : (
          <>
            {report.verification_status !== 'verified' && (
              <button onClick={() => decide('verified')} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(52,211,153,.2)', color: 'var(--green)', fontWeight: 700, fontSize: 13
              }}>{isPending ? '✅ Verify & Approve' : '✅ Approve instead'}</button>
            )}
            {report.verification_status !== 'rejected' && (
              <button onClick={() => setShowReject(true)} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(248,113,113,.15)', color: 'var(--red)', fontWeight: 700, fontSize: 13
              }}>{isPending ? '❌ Reject' : '❌ Reject instead'}</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AssignTaskModal({ employees, onClose, onSaved, defaultDate }) {
  const [empId, setEmpId] = useState('')
  const [schools, setSchools] = useState([])
  const [suggested, setSuggested] = useState({ schools: [], new_round: false, total_schools: 0, visited_count: 0, unvisited_count: 0, eligible_count: 0 })
  const [form, setForm] = useState({ title: '', school_id: '', priority: 'medium', due_date: defaultDate, description: '' })
  const [dailyCount, setDailyCount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [subLocations, setSubLocations] = useState([])
  const [selectedSubLocs, setSelectedSubLocs] = useState([])

  useEffect(() => {
    api.get('/api/schools/', { params: { limit: 2000 } }).then(r => setSchools(r.data?.items || []))
  }, [])

  // Sites with sub-locations (hospitals, temples) get picked as a whole here, but
  // technicians visit/report on each sub-location individually — so once one is
  // selected, offer its sub-locations to pick from instead, one task per pick.
  useEffect(() => {
    setSelectedSubLocs([])
    if (!form.school_id) { setSubLocations([]); return }
    api.get(`/api/schools/?parent_id=${form.school_id}`).then(r => setSubLocations(r.data?.items || []))
  }, [form.school_id])

  useEffect(() => {
    if (!empId) return
    api.get('/api/tasks/daily-count', { params: { employee_id: empId, task_date: form.due_date } })
      .then(r => setDailyCount(r.data))
    api.get('/api/tasks/suggested-schools', { params: { employee_id: empId, task_date: form.due_date } })
      .then(r => setSuggested(r.data))
  }, [empId, form.due_date])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    const usingSubLocs = subLocations.length > 0
    if (!empId) { setError('Select an employee'); return }
    // The site must be picked from the list — typing it in the title only isn't
    // enough, or the visit can't be traced back to a school (proof review and the
    // service-report PDF would show no site/customer details).
    if (!form.school_id) { setError('Select the school / site for this task — pick it from the list below.'); return }
    if (usingSubLocs && selectedSubLocs.length === 0) { setError('Select at least one sub-location — a task can\'t be assigned to the hospital/temple row itself once it has sub-locations.'); return }
    if (!usingSubLocs && !form.title.trim()) { setError('Enter a task title'); return }
    // No cap on manual assignment — deskwork can add as many as the day needs, whatever
    // the count already is. A soft over-default note may still come back from the server.
    setLoading(true); setError('')
    try {
      // The server can accept a task and still return a note worth reading (over the
      // default daily count, or a same-day duplicate for that site). Collect those and
      // hand them to the parent for a toast — calling setError here achieved nothing,
      // because onClose() unmounts this modal on the same tick and the message never
      // got a chance to render.
      const notes = []
      if (usingSubLocs) {
        for (const slId of selectedSubLocs) {
          const sl = subLocations.find(s => s.id === slId)
          const r = await api.post('/api/tasks/', {
            title: `Visit ${sl.name}`, description: form.description,
            assigned_to_id: Number(empId), school_id: slId,
            priority: form.priority, due_date: form.due_date
          })
          if (r.data?.warning) notes.push(r.data.warning)
        }
      } else {
        const r = await api.post('/api/tasks/', {
          title: form.title, description: form.description,
          assigned_to_id: Number(empId),
          school_id: form.school_id ? Number(form.school_id) : null,
          priority: form.priority, due_date: form.due_date
        })
        if (r.data?.warning) notes.push(r.data.warning)
      }
      onSaved(notes.join(' ')); onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to assign task')
    }
    setLoading(false)
  }

  const emp = employees.find(e => String(e.id) === String(empId))
  // Full list of every school/site — rotation eligibility is enforced server-side
  // and shown via the suggestion chips above, not by hiding schools here. A
  // technician's real assigned sites often span several mandals (their own
  // employee_mandals list, not just their single legacy mandal_id), so filtering
  // this dropdown down to one mandal was hiding most of their actual sites.
  const mandalSchools = schools

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📋 Assign Task</h3>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Assign To *</label>
            <SearchableSelect
              value={empId}
              onChange={setEmpId}
              placeholder="Select employee…"
              options={employees.map(e => ({ value: String(e.id), label: `${e.name} [${e.employee_code}]` }))}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>

        {/* Daily count — informational only, no cap on manual assignment */}
        {dailyCount && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12,
            background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', color: 'var(--green)'
          }}>
            📋 {dailyCount.count} task{dailyCount.count === 1 ? '' : 's'} assigned today
            {!dailyCount.posted && dailyCount.count >= dailyCount.default_limit ? ` — beyond the usual ${dailyCount.default_limit}, that's fine` : ''}
          </div>
        )}

        {/* Rotation suggestions — shortcuts, never restrictions. Rotation only governs
            what "Generate Daily" hands out on its own; anything in the School / Site
            list below can be assigned by hand at any point in the cycle. Previously
            this whole panel was dead code: it gated on suggested.total_in_mandal,
            which the API never returns, so undefined > 0 hid the chips entirely. */}
        {empId && suggested.total_schools > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                🔄 Rotation round — {suggested.visited_count}/{suggested.total_schools} sites covered
              </span>
              {suggested.new_round
                ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(52,211,153,.15)', color: 'var(--green)', fontWeight: 700 }}>Round complete — restarting</span>
                : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(34,211,238,.15)', color: 'var(--accent)', fontWeight: 700 }}>
                    {suggested.unvisited_count} left this round
                  </span>
              }
            </div>
            {suggested.schools.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                Rotation has nothing left to suggest for this technician today — every site is
                either covered this round or already on their list. Pick any site below to assign
                one anyway.
              </div>
            ) : (
              <>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>
                Next up in rotation — tap to fill the form. You're not limited to these: any site
                in the list below can be assigned now, whatever the rotation says.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {suggested.schools.map(s => (
                  <button key={s.id} onClick={() => { set('school_id', String(s.id)); set('title', `Visit ${s.name}`) }}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                      background: String(form.school_id) === String(s.id) ? 'rgba(34,211,238,.2)' : 'var(--surface2)',
                      border: `1px solid ${s.plant_condition === 'not_working' ? 'var(--red)' : String(form.school_id) === String(s.id) ? 'var(--accent)' : 'var(--border)'}`,
                      color: String(form.school_id) === String(s.id) ? 'var(--accent)' : 'var(--text)'
                    }}>
                    🏫 {s.name}
                    {s.plant_condition === 'not_working' && (
                      <span style={{ color: 'var(--red)', marginLeft: 4, fontWeight: 700 }}>⚠ Unresolved</span>
                    )}
                    {s.last_visit_date
                      ? <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({s.last_visit_date})</span>
                      : <span style={{ color: 'var(--yellow)', marginLeft: 4, fontWeight: 700 }}>(never visited)</span>
                    }
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        )}

        {subLocations.length === 0 && (
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Task Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Visit Nalgonda PS, Repair pump…" />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>School / Site *</label>
            <SearchableSelect
              value={form.school_id}
              onChange={val => set('school_id', val)}
              placeholder="Select school…"
              options={mandalSchools.map(s => ({ value: String(s.id), label: s.name }))}
            />
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

        {subLocations.length > 0 && (
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Sub-locations * — pick one or more, each becomes its own task ({selectedSubLocs.length} selected)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 170, overflowY: 'auto', padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
              {subLocations.map(sl => {
                const checked = selectedSubLocs.includes(sl.id)
                return (
                  <button key={sl.id} type="button" onClick={() => {
                    setSelectedSubLocs(prev => checked ? prev.filter(id => id !== sl.id) : [...prev, sl.id])
                  }} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                    background: checked ? 'rgba(34,211,238,.2)' : 'var(--surface2)',
                    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    color: checked ? 'var(--accent)' : 'var(--text)'
                  }}>
                    {checked ? '✓ ' : ''}{sl.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Description</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional notes…" />
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
            {loading ? '⏳ Assigning…' : selectedSubLocs.length > 1 ? `✅ Assign ${selectedSubLocs.length} Tasks` : '✅ Assign Task'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
