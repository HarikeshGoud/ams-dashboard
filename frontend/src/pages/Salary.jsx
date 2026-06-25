import { useEffect, useState } from 'react'
import api from '../api/axios'
import { exportSalaryExcel, exportSalaryPDF } from '../utils/exportReports'

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export default function Salary() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [data, setData]   = useState(null)
  const [overrides, setOverrides] = useState({})   // emp_id -> { final_amount, note }
  const [edits, setEdits] = useState({})            // emp_id -> { amount, note } (unsaved)
  const [saving, setSaving] = useState({})
  const [msgs, setMsgs] = useState({})
  const [loading, setLoading] = useState(false)
  const [baseSalaries, setBaseSalaries] = useState({})
  const [savingBase, setSavingBase] = useState({})
  const [allowances, setAllowances] = useState([])
  const [tab, setTab] = useState('salary')

  const load = async () => {
    setLoading(true)
    setEdits({})
    try {
      const [sumRes, ovrRes] = await Promise.all([
        api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`),
        api.get(`/api/salary-overrides/?month=${month}&year=${year}`)
      ])
      setData(sumRes.data)
      const ovrMap = {}
      ovrRes.data.forEach(o => { ovrMap[o.employee_id] = o })
      setOverrides(ovrMap)
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

  const saveOverride = async (empId, calcSalary) => {
    const edit = edits[empId]
    if (!edit?.amount) return
    setSaving(s => ({ ...s, [empId]: true }))
    setMsgs(m => ({ ...m, [empId]: '' }))
    try {
      await api.post('/api/salary-overrides/', {
        employee_id: empId, month, year,
        final_amount: Number(edit.amount),
        note: edit.note || null
      })
      setMsgs(m => ({ ...m, [empId]: '✅ Saved' }))
      setEdits(e => { const n = { ...e }; delete n[empId]; return n })
      await load()
    } catch {
      setMsgs(m => ({ ...m, [empId]: '❌ Failed' }))
    } finally {
      setSaving(s => ({ ...s, [empId]: false }))
    }
  }

  const clearOverride = async (empId) => {
    setSaving(s => ({ ...s, [empId]: true }))
    try {
      await api.delete(`/api/salary-overrides/?employee_id=${empId}&month=${month}&year=${year}`)
      setMsgs(m => ({ ...m, [empId]: '✅ Cleared' }))
      await load()
    } catch {
      setMsgs(m => ({ ...m, [empId]: '❌ Failed' }))
    } finally {
      setSaving(s => ({ ...s, [empId]: false }))
    }
  }

  const saveBase = async (empId) => {
    const val = baseSalaries[empId]
    if (!val) return
    setSavingBase(s => ({ ...s, [empId]: true }))
    await api.patch(`/api/attendance/base-salary/${empId}`, null, { params: { salary: val } })
    setSavingBase(s => ({ ...s, [empId]: false }))
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
            {data && data.technicians.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button onClick={() => exportSalaryExcel(data.technicians, overrides, month, year, data.working_days)}
                  style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  ⬇ Excel
                </button>
                <button onClick={() => exportSalaryPDF(data.technicians, overrides, month, year, data.working_days)}
                  style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  ⬇ PDF
                </button>
              </div>
            )}
          </div>

          {loading && <p>Loading...</p>}

          {data && data.technicians.length > 0 && (() => {
            const totalCalc  = data.technicians.reduce((s, t) => s + t.calculated_salary, 0)
            const totalFinal = data.technicians.reduce((s, t) => {
              const ovr = overrides[t.employee_id]
              return s + (ovr ? ovr.final_amount : t.calculated_salary)
            }, 0)
            const hasOverrides = data.technicians.some(t => overrides[t.employee_id])
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <TotalCard label="Total Employees" value={data.technicians.length} sub="technicians this month" color="#475569" bg="#f8fafc" />
                <TotalCard label="Total Calc Salary" value={`₹${Number(totalCalc).toLocaleString('en-IN')}`} sub="based on attendance" color="#2563eb" bg="#eff6ff" />
                {hasOverrides
                  ? <TotalCard label="Total Final Payout" value={`₹${Number(totalFinal).toLocaleString('en-IN')}`} sub="after overrides applied" color="#7c3aed" bg="#f5f3ff" big />
                  : <TotalCard label="Total Final Payout" value={`₹${Number(totalFinal).toLocaleString('en-IN')}`} sub="no overrides this month" color="#16a34a" bg="#dcfce7" big />
                }
                {hasOverrides && (
                  <TotalCard
                    label="Override Difference"
                    value={`${totalFinal >= totalCalc ? '+' : ''}₹${Number(totalFinal - totalCalc).toLocaleString('en-IN')}`}
                    sub={totalFinal >= totalCalc ? 'extra paid vs calculated' : 'saved vs calculated'}
                    color={totalFinal >= totalCalc ? '#b91c1c' : '#16a34a'}
                    bg={totalFinal >= totalCalc ? '#fee2e2' : '#dcfce7'}
                  />
                )}
              </div>
            )
          })()}

          {data && data.technicians.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0f4ff', textAlign: 'left' }}>
                    {['Employee','Present','Att%','Base Salary','Calc Salary','Final Payout','Override Note','Actions'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.8rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.technicians.map(emp => {
                    const ovr = overrides[emp.employee_id]
                    const edit = edits[emp.employee_id]
                    const finalPayout = ovr ? ovr.final_amount : emp.calculated_salary
                    const isOverridden = !!ovr
                    const curBase = baseSalaries[emp.employee_id] !== undefined ? baseSalaries[emp.employee_id] : emp.base_salary

                    return (
                      <tr key={emp.employee_id} style={{ borderBottom: '1px solid #eee' }}>
                        {/* Name */}
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{emp.employee_name}</td>

                        {/* Present */}
                        <td style={{ padding: '0.6rem 0.8rem', color: '#15803d', fontWeight: 600 }}>{emp.present}</td>

                        {/* Att% */}
                        <td style={{ padding: '0.6rem 0.8rem' }}>{emp.attendance_pct}%</td>

                        {/* Base Salary (editable) */}
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input type="number" value={curBase}
                              onChange={e => setBaseSalaries(b => ({ ...b, [emp.employee_id]: e.target.value }))}
                              style={{ width: 80, padding: '0.2rem 0.4rem', borderRadius: 5, border: '1px solid #ccc', fontSize: 12 }} />
                            <button onClick={() => saveBase(emp.employee_id)} disabled={savingBase[emp.employee_id]}
                              style={{ padding: '0.2rem 0.5rem', borderRadius: 5, background: '#64748b', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                              {savingBase[emp.employee_id] ? '…' : 'Set'}
                            </button>
                          </div>
                        </td>

                        {/* Calc Salary */}
                        <td style={{ padding: '0.6rem 0.8rem', color: '#64748b' }}>
                          ₹{Number(emp.calculated_salary).toLocaleString()}
                        </td>

                        {/* Final Payout */}
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14,
                              color: isOverridden ? '#7c3aed' : '#2563eb' }}>
                              ₹{Number(finalPayout).toLocaleString()}
                            </span>
                            {isOverridden && (
                              <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>✏️ Overridden</span>
                            )}
                          </div>
                        </td>

                        {/* Note */}
                        <td style={{ padding: '0.6rem 0.8rem', color: '#666', fontSize: 12, maxWidth: 140 }}>
                          {ovr?.note || <span style={{ color: '#ccc' }}>—</span>}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '0.6rem 0.8rem', minWidth: 200 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input type="number"
                                placeholder={`₹${Number(emp.calculated_salary).toFixed(0)}`}
                                value={edit?.amount || ''}
                                onChange={e => setEdits(d => ({ ...d, [emp.employee_id]: { ...d[emp.employee_id], amount: e.target.value } }))}
                                style={{ width: 85, padding: '0.2rem 0.4rem', borderRadius: 5, border: '1px solid #a78bfa', fontSize: 12 }} />
                              <input type="text"
                                placeholder="Reason..."
                                value={edit?.note || ''}
                                onChange={e => setEdits(d => ({ ...d, [emp.employee_id]: { ...d[emp.employee_id], note: e.target.value } }))}
                                style={{ width: 90, padding: '0.2rem 0.4rem', borderRadius: 5, border: '1px solid #a78bfa', fontSize: 12 }} />
                              <button onClick={() => saveOverride(emp.employee_id, emp.calculated_salary)}
                                disabled={saving[emp.employee_id] || !edit?.amount}
                                style={{ padding: '0.2rem 0.6rem', borderRadius: 5, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11,
                                  opacity: (!edit?.amount || saving[emp.employee_id]) ? 0.5 : 1 }}>
                                {saving[emp.employee_id] ? '…' : 'Override'}
                              </button>
                            </div>
                            {isOverridden && (
                              <button onClick={() => clearOverride(emp.employee_id)}
                                style={{ padding: '0.15rem 0.5rem', borderRadius: 5, background: 'transparent', color: '#dc2626', border: '1px solid #dc2626', cursor: 'pointer', fontSize: 11, alignSelf: 'flex-start' }}>
                                ✕ Clear override
                              </button>
                            )}
                            {msgs[emp.employee_id] && (
                              <span style={{ fontSize: 11, color: msgs[emp.employee_id].startsWith('✅') ? '#15803d' : '#dc2626' }}>
                                {msgs[emp.employee_id]}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Legend */}
              <div style={{ marginTop: '1rem', display: 'flex', gap: 20, fontSize: 12, color: '#666' }}>
                <span><span style={{ color: '#2563eb', fontWeight: 700 }}>Blue</span> = calculated salary (no override)</span>
                <span><span style={{ color: '#7c3aed', fontWeight: 700 }}>Purple ✏️</span> = manually overridden final payout</span>
              </div>
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

function TotalCard({ label, value, sub, color, bg, big }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 12, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{sub}</div>
    </div>
  )
}

function AllowancePanel({ allowances, onReview }) {
  const [notes, setNotes] = useState({})
  const [expanded, setExpanded] = useState({})

  const statusBadge = (status) => {
    const map = { pending: { bg: '#fef9c3', color: '#ca8a04' }, granted: { bg: '#dcfce7', color: '#16a34a' }, revoked: { bg: '#fee2e2', color: '#dc2626' } }
    const s = map[status] || { bg: '#f3f4f6', color: '#374151' }
    return <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
  }

  if (allowances.length === 0) return <p style={{ color: '#888' }}>No allowance requests.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {allowances.map(req => (
        <div key={req.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div><b>{req.employee_name}</b><span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{req.date}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: '#2563eb' }}>₹{Number(req.amount).toLocaleString()}</span>
              {statusBadge(req.status)}
            </div>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: 13, color: '#444' }}>{req.reason}</p>
          {req.admin_note && <p style={{ margin: '0.3rem 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>Note: {req.admin_note}</p>}
          {req.status === 'pending' && (
            <div style={{ marginTop: '0.75rem' }}>
              {expanded[req.id] && (
                <input placeholder="Optional note..." value={notes[req.id] || ''}
                  onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                  style={{ display: 'block', marginBottom: 8, width: '100%', padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { if (!expanded[req.id]) { setExpanded(e => ({ ...e, [req.id]: true })); return } onReview(req.id, 'granted', notes[req.id]) }}
                  style={{ padding: '0.35rem 0.9rem', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>✅ Grant</button>
                <button onClick={() => { if (!expanded[req.id]) { setExpanded(e => ({ ...e, [req.id]: true })); return } onReview(req.id, 'revoked', notes[req.id]) }}
                  style={{ padding: '0.35rem 0.9rem', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>❌ Revoke</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
