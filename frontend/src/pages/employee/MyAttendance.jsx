import { useState, useEffect } from 'react'
import api from '../../api/axios'

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const STATUS_BADGE = {
  present:  { bg: '#dcfce7', color: '#16a34a', label: 'Present' },
  absent:   { bg: '#fee2e2', color: '#dc2626', label: 'Absent' },
  half_day: { bg: '#fef9c3', color: '#ca8a04', label: 'Half Day' },
  leave:    { bg: '#ffedd5', color: '#ea580c', label: 'Leave' },
}

export default function MyAttendance() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('attendance')

  // Allowance request form
  const [form, setForm] = useState({ amount: '', reason: '', date: new Date().toISOString().slice(0, 10) })
  const [submitting, setSubmitting] = useState(false)
  const [allowances, setAllowances] = useState([])
  const [allowMsg, setAllowMsg] = useState('')

  const loadSummary = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/attendance/my-summary?month=${month}&year=${year}`)
      setSummary(r.data)
    } finally {
      setLoading(false)
    }
  }

  const loadAllowances = async () => {
    const r = await api.get('/api/allowances/')
    setAllowances(r.data)
  }

  useEffect(() => { loadSummary() }, [month, year])
  useEffect(() => { if (tab === 'allowance') loadAllowances() }, [tab])

  const submitAllowance = async () => {
    if (!form.amount || !form.reason) return
    setSubmitting(true)
    setAllowMsg('')
    try {
      await api.post('/api/allowances/', form)
      setAllowMsg('✅ Request submitted successfully!')
      setForm({ amount: '', reason: '', date: new Date().toISOString().slice(0, 10) })
      loadAllowances()
    } catch {
      setAllowMsg('❌ Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y)

  const statusBadge = (status) => {
    const s = STATUS_BADGE[status] || { bg: '#f3f4f6', color: '#374151', label: status }
    return (
      <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  const allowanceStatusBadge = (status) => {
    const map = {
      pending:  { bg: '#fef9c3', color: '#ca8a04' },
      granted:  { bg: '#dcfce7', color: '#16a34a' },
      revoked:  { bg: '#fee2e2', color: '#dc2626' },
    }
    const s = map[status] || { bg: '#f3f4f6', color: '#374151' }
    return (
      <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>My Attendance & Allowances</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
        {[['attendance', '📅 Attendance'], ['allowance', '💰 Allowance Requests']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '0.5rem 1.2rem', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === key ? '#2563eb' : '#666', fontWeight: tab === key ? 700 : 400,
              marginBottom: -2, fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && (
        <>
          {/* Month/Year picker */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={month} onChange={e => setMonth(+e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {loading && <p>Loading...</p>}

          {summary && (
            <>
              {/* Salary card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <Card label="Base Salary" value={`₹${Number(summary.base_salary).toLocaleString()}`} color="#2563eb" />
                <Card label="Calculated Salary" value={`₹${Number(summary.calculated_salary).toLocaleString()}`} color="#16a34a" big />
                <Card label="Attendance" value={`${summary.attendance_pct}%`} color={summary.attendance_pct >= 80 ? '#16a34a' : '#ca8a04'} />
                <Card label="Present" value={summary.present} color="#16a34a" />
                <Card label="Half Day" value={summary.half_day} color="#ca8a04" />
                <Card label="Absent" value={summary.absent} color="#dc2626" />
              </div>

              {/* Daily records */}
              {summary.daily_records.length === 0 ? (
                <p style={{ color: '#888' }}>No attendance records for this month.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#f0f4ff', textAlign: 'left' }}>
                        <th style={th}>Date</th>
                        <th style={th}>Status</th>
                        <th style={th}>Check In</th>
                        <th style={th}>Check Out</th>
                        <th style={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.daily_records.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={td}>{r.date}</td>
                          <td style={td}>{statusBadge(r.status)}</td>
                          <td style={td}>{r.check_in || '—'}</td>
                          <td style={td}>{r.check_out || '—'}</td>
                          <td style={td}>{r.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'allowance' && (
        <>
          {/* Request form */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: 15 }}>Submit Allowance Request</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (₹)
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 500"
                  style={{ display: 'block', marginTop: 4, width: '100%', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Reason
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Describe the reason for your request"
                  rows={3}
                  style={{ display: 'block', marginTop: 4, width: '100%', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Date
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ display: 'block', marginTop: 4, padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }} />
              </label>
              {allowMsg && <p style={{ margin: 0, fontSize: 13, color: allowMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{allowMsg}</p>}
              <button onClick={submitAllowance} disabled={submitting}
                style={{ padding: '0.55rem 1.5rem', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>

          {/* Past requests */}
          <h3 style={{ fontSize: 14, marginBottom: '0.75rem' }}>My Requests</h3>
          {allowances.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>No allowance requests yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {allowances.map(req => (
                <div key={req.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>₹{Number(req.amount).toLocaleString()}</span>
                      <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{req.date}</span>
                    </div>
                    {allowanceStatusBadge(req.status)}
                  </div>
                  <p style={{ margin: '0.4rem 0 0', fontSize: 13, color: '#444' }}>{req.reason}</p>
                  {req.admin_note && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                      Admin note: {req.admin_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Card({ label, value, color, big }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: big ? 22 : 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const th = { padding: '0.6rem 0.8rem', borderBottom: '2px solid #ddd' }
const td = { padding: '0.55rem 0.8rem' }
