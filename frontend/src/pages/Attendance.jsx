import { useEffect, useState } from 'react'
import api from '../api/axios'
import { exportAttendanceExcel, exportAttendancePDF } from '../utils/exportReports'

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const DAY_NAMES = ["Su","Mo","Tu","We","Th","Fr","Sa"]

const STATUS = {
  present:  { label: 'P', color: '#16a34a', bg: '#dcfce7', text: 'Present' },
  half_day: { label: 'H', color: '#d97706', bg: '#fef3c7', text: 'Half Day' },
  absent:   { label: 'A', color: '#dc2626', bg: '#fee2e2', text: 'Absent' },
  leave:    { label: 'L', color: '#7c3aed', bg: '#ede9fe', text: 'Leave' },
}

// Cycle order when clicking an empty/marked cell
const CYCLE = ['present', 'absent', 'half_day', 'leave', null]

export default function Attendance() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [technicians, setTechnicians] = useState([])
  const [records, setRecords] = useState({}) // { empId: { dateStr: status } }
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(null) // "empId-dateStr"
  const [workingDays, setWorkingDays] = useState(0)
  const [toast, setToast] = useState('')
  const [editSalary, setEditSalary] = useState(null) // { empId, value }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const dt = new Date(year, month - 1, d)
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return { d, dow: dt.getDay(), isSun: dt.getDay() === 0, dateStr, isToday: dateStr === todayStr }
  })

  async function load() {
    setLoading(true)
    try {
      const r = await api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`)
      setTechnicians(r.data.technicians || [])
      setWorkingDays(r.data.working_days || 0)

      // Load all daily records for all employees in parallel
      const empIds = (r.data.technicians || []).map(t => t.employee_id)
      const results = await Promise.all(
        empIds.map(id => api.get(`/api/attendance/?employee_id=${id}&month=${month}&year=${year}`))
      )
      const map = {}
      results.forEach((res, i) => {
        const empId = empIds[i]
        map[empId] = {}
        ;(res.data || []).forEach(rec => { map[empId][rec.date] = rec.status })
      })
      setRecords(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [month, year])

  async function toggleStatus(empId, dateStr, currentStatus) {
    const key = `${empId}-${dateStr}`
    setMarking(key)
    const idx = CYCLE.indexOf(currentStatus)
    const nextStatus = CYCLE[(idx + 1) % CYCLE.length]
    try {
      if (nextStatus === null) {
        await api.post('/api/attendance/mark', { employee_id: empId, date: dateStr, status: 'absent' })
        setRecords(r => ({ ...r, [empId]: { ...r[empId], [dateStr]: undefined } }))
      } else {
        await api.post('/api/attendance/mark', { employee_id: empId, date: dateStr, status: nextStatus })
        setRecords(r => ({ ...r, [empId]: { ...r[empId], [dateStr]: nextStatus } }))
      }
      // Update summary counts without full reload
      const sr = await api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`)
      setTechnicians(sr.data.technicians || [])
    } catch(e) {
      showToast('❌ Failed to mark — try again')
    } finally {
      setMarking(null)
    }
  }

  async function saveSalary(empId, value) {
    if (!value || isNaN(value)) return
    try {
      await api.patch(`/api/attendance/base-salary/${empId}`, null, { params: { salary: Number(value) } })
      showToast('✅ Salary updated!')
      setEditSalary(null)
      load()
    } catch {
      showToast('❌ Failed to save salary')
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
      <div className="spinner" />
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading attendance register…</div>
    </div>
  )

  return (
    <div style={{ padding: '16px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>🗓️ Attendance Register</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{workingDays} working days · Click any cell to mark</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Month selector - big easy buttons */}
          <button onClick={() => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }}
            style={navBtn}>‹ Prev</button>
          <div style={{ fontWeight: 700, fontSize: 15, minWidth: 130, textAlign: 'center' }}>
            {MONTHS[month-1]} {year}
          </div>
          <button onClick={() => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }}
            style={navBtn}>Next ›</button>

          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

          <button onClick={() => exportAttendanceExcel(technicians, month, year, workingDays)}
            style={{ ...actionBtn, background: '#16a34a' }}>⬇ Excel</button>
          <button onClick={() => exportAttendancePDF(technicians, month, year, workingDays)}
            style={{ ...actionBtn, background: '#dc2626' }}>⬇ PDF</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: v.bg, border: `2px solid ${v.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: v.color, fontSize: 12 }}>
              {v.label}
            </div>
            <span style={{ color: 'var(--muted)' }}>{v.text}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px dashed var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>—</div>
          <span style={{ color: 'var(--muted)' }}>Not marked</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto', alignSelf: 'center' }}>
          💡 Click a cell to cycle: Present → Absent → Half Day → Leave
        </div>
      </div>

      {/* Register Table */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            {/* Day-of-week row */}
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ ...th, width: 160, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2 }}>
                Employee
              </th>
              {days.map(({ d, dow, isSun, isToday }) => (
                <th key={d} style={{
                  ...th, width: 36, padding: '6px 2px',
                  background: isToday ? '#2563eb' : isSun ? 'var(--surface)' : 'var(--surface2)',
                  color: isToday ? '#fff' : isSun ? 'var(--muted)' : 'var(--text)',
                  borderBottom: isToday ? '2px solid #2563eb' : '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{DAY_NAMES[dow]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{d}</div>
                </th>
              ))}
              <th style={{ ...th, background: '#dcfce7', color: '#15803d', minWidth: 36 }}>P</th>
              <th style={{ ...th, background: '#fee2e2', color: '#dc2626', minWidth: 36 }}>A</th>
              <th style={{ ...th, background: '#fef3c7', color: '#d97706', minWidth: 36 }}>H</th>
              <th style={{ ...th, background: '#ede9fe', color: '#7c3aed', minWidth: 36 }}>L</th>
              <th style={{ ...th, minWidth: 52 }}>%</th>
              <th style={{ ...th, minWidth: 90 }}>Salary</th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((emp, rowIdx) => {
              const empRecords = records[emp.employee_id] || {}
              const rowBg = rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'
              const pct = emp.attendance_pct || 0
              const pctColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
              const summary = technicians.find(t => t.employee_id === emp.employee_id)

              return (
                <tr key={emp.employee_id} style={{ background: rowBg }}>
                  {/* Employee name — sticky */}
                  <td style={{ ...td, position: 'sticky', left: 0, background: rowBg, zIndex: 1, fontWeight: 600, fontSize: 13, minWidth: 160 }}>
                    <div>{emp.employee_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{emp.employee_code}</div>
                  </td>

                  {/* Day cells */}
                  {days.map(({ d, isSun, dateStr, isToday }) => {
                    const status = empRecords[dateStr]
                    const s = status ? STATUS[status] : null
                    const key = `${emp.employee_id}-${dateStr}`
                    const isMarking = marking === key
                    return (
                      <td key={d} style={{ padding: 3, textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                        <div
                          onClick={() => !isMarking && toggleStatus(emp.employee_id, dateStr, status || null)}
                          title={s ? s.text : 'Click to mark'}
                          style={{
                            width: 30, height: 30, borderRadius: 6, margin: '0 auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isMarking ? 'var(--surface2)' : s ? s.bg : isSun ? 'transparent' : 'var(--surface2)',
                            border: isMarking ? '1px dashed var(--muted)' : s ? `2px solid ${s.color}` : isToday ? '2px solid #2563eb33' : isSun ? 'none' : '1px dashed var(--border)',
                            color: s ? s.color : 'var(--muted)',
                            fontWeight: 800, fontSize: 12,
                            cursor: isSun ? 'default' : 'pointer',
                            opacity: isSun && !s ? 0.3 : 1,
                            transition: 'all 0.1s',
                          }}
                          onMouseEnter={e => { if (!isSun) e.currentTarget.style.transform = 'scale(1.15)' }}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {isMarking ? '·' : s ? s.label : isSun ? '' : ''}
                        </div>
                      </td>
                    )
                  })}

                  {/* Totals */}
                  <td style={{ ...td, textAlign: 'center', color: '#16a34a', fontWeight: 700, background: '#dcfce710' }}>{summary?.present || 0}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#dc2626', fontWeight: 700, background: '#fee2e210' }}>{summary?.absent || 0}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#d97706', fontWeight: 700, background: '#fef3c710' }}>{summary?.half_day || 0}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#7c3aed', fontWeight: 700, background: '#ede9fe10' }}>{summary?.leave || 0}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: pctColor, fontSize: 14 }}>{pct}%</td>

                  {/* Salary */}
                  <td style={{ ...td, textAlign: 'center' }}>
                    {editSalary?.empId === emp.employee_id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="number"
                          value={editSalary.value}
                          onChange={e => setEditSalary(s => ({ ...s, value: e.target.value }))}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveSalary(emp.employee_id, editSalary.value); if (e.key === 'Escape') setEditSalary(null) }}
                          style={{ width: 70, padding: '3px 5px', borderRadius: 5, border: '1px solid var(--accent)', fontSize: 12, background: 'var(--surface2)', color: 'var(--text)' }}
                        />
                        <button onClick={() => saveSalary(emp.employee_id, editSalary.value)}
                          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 11 }}>✓</button>
                        <button onClick={() => setEditSalary(null)}
                          style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                      </div>
                    ) : (
                      <div onClick={() => setEditSalary({ empId: emp.employee_id, value: String(emp.base_salary || '') })}
                        style={{ cursor: 'pointer', fontSize: 12 }}
                        title="Click to edit salary">
                        <div style={{ fontWeight: 600 }}>₹{Number(emp.calculated_salary || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>base ₹{Number(emp.base_salary || 0).toLocaleString()} ✏️</div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: 10,
          fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const th = {
  padding: '8px 4px', textAlign: 'center', fontWeight: 700, fontSize: 12,
  borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}
const td = {
  padding: '8px 6px', fontSize: 13, borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const navBtn = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const actionBtn = {
  padding: '7px 14px', borderRadius: 8, border: 'none',
  color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
