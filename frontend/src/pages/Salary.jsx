import { useEffect, useState } from 'react'
import api from '../api/axios'

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export default function Salary() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [baseSalaries, setBaseSalaries] = useState({})
  const [saving, setSaving] = useState({})

  // Allowances
  const [allowances, setAllowances] = useState([])
  const [tab, setTab] = useState('salary')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`)
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }

  const loadAllowances = async () => {
    const r = await api.get('/api/allowances/')
    setAllowances(r.data)
  }

  useEffect(() => { load() }, [month, year])
  useEffect(() => { if (tab === 'allowances') loadAllowances() }, [tab])

  const saveBase = async (empId) => {
    const val = baseSalaries[empId]
    if (!val) return
    setSaving(s => ({ ...s, [empId]: true }))
    await api.patch(`/api/attendance/base-salary/${empId}?salary=${val}`)
    setSaving(s => ({ ...s, [empId]: false }))
    setBaseSalaries(b => { const n = { ...b }; delete n[empId]; return n })
    load()
  }

  const reviewAllowance = async (reqId, status, note = '') => {
    await api.patch(`/api/allowances/${reqId}`, { status, admin_note: note || null })
    loadAllowances()
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y)

  const pendingAllowances = allowances.filter(a => a.status === 'pending')

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Salary Management</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
        {[['salary', '💳 Salary'], ['allowances', `💰 Allowances${pendingAllowances.length ? ` (${pendingAllowances.length})` : ''}`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '0.5rem 1.2rem', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === key ? '#2563eb' : '#666', fontWeight: tab === key ? 700 : 400,
              marginBottom: -2, fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'salary' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={month} onChange={e => setMonth(+e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {data && <span style={{ color: '#666', fontSize: 13 }}>Working days: <b>{data.working_days}</b></span>}
          </div>

          {loading && <p>Loading...</p>}

          {data && data.technicians.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f0f4ff', textAlign: 'left' }}>
                    {['Employee','Present','Att%','Base Salary','Calc Salary','Set Base Salary'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.8rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.technicians.map(emp => {
                    const curBase = baseSalaries[emp.employee_id] !== undefined
                      ? baseSalaries[emp.employee_id]
                      : emp.base_salary
                    return (
                      <tr key={emp.employee_id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{emp.employee_name}</td>
                        <td style={{ padding: '0.6rem 0.8rem', color: '#16a34a', fontWeight: 600 }}>{emp.present}</td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>{emp.attendance_pct}%</td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>₹{Number(emp.base_salary).toLocaleString()}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700, color: '#2563eb' }}>
                          ₹{Number(emp.calculated_salary).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="number"
                              value={curBase}
                              onChange={e => setBaseSalaries(b => ({ ...b, [emp.employee_id]: e.target.value }))}
                              style={{ width: 90, padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                            />
                            <button
                              onClick={() => saveBase(emp.employee_id)}
                              disabled={saving[emp.employee_id]}
                              style={{ padding: '0.25rem 0.7rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                              {saving[emp.employee_id] ? '…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'allowances' && (
        <AllowancePanel allowances={allowances} onReview={reviewAllowance} />
      )}
    </div>
  )
}

function AllowancePanel({ allowances, onReview }) {
  const [notes, setNotes] = useState({})
  const [expanded, setExpanded] = useState({})

  const statusBadge = (status) => {
    const map = {
      pending: { bg: '#fef9c3', color: '#ca8a04' },
      granted: { bg: '#dcfce7', color: '#16a34a' },
      revoked: { bg: '#fee2e2', color: '#dc2626' },
    }
    const s = map[status] || { bg: '#f3f4f6', color: '#374151' }
    return (
      <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  if (allowances.length === 0) return <p style={{ color: '#888' }}>No allowance requests.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {allowances.map(req => (
        <div key={req.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <b>{req.employee_name}</b>
              <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{req.date}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: '#2563eb' }}>₹{Number(req.amount).toLocaleString()}</span>
              {statusBadge(req.status)}
            </div>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: 13, color: '#444' }}>{req.reason}</p>
          {req.admin_note && (
            <p style={{ margin: '0.3rem 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>Note: {req.admin_note}</p>
          )}
          {req.status === 'pending' && (
            <div style={{ marginTop: '0.75rem' }}>
              {expanded[req.id] && (
                <input
                  placeholder="Optional note..."
                  value={notes[req.id] || ''}
                  onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                  style={{ display: 'block', marginBottom: 8, width: '100%', padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    if (!expanded[req.id]) { setExpanded(e => ({ ...e, [req.id]: true })); return }
                    onReview(req.id, 'granted', notes[req.id])
                  }}
                  style={{ padding: '0.35rem 0.9rem', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  ✅ Grant
                </button>
                <button
                  onClick={() => {
                    if (!expanded[req.id]) { setExpanded(e => ({ ...e, [req.id]: true })); return }
                    onReview(req.id, 'revoked', notes[req.id])
                  }}
                  style={{ padding: '0.35rem 0.9rem', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  ❌ Revoke
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
