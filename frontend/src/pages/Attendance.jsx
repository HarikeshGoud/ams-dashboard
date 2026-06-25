import { useEffect, useState } from 'react'
import api from '../api/axios'

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

const STATUS_STYLE = {
  present:  { bg: '#dcfce7', color: '#15803d', label: 'P' },
  half_day: { bg: '#fef9c3', color: '#a16207', label: 'H' },
  absent:   { bg: '#fee2e2', color: '#b91c1c', label: 'A' },
  leave:    { bg: '#ffedd5', color: '#c2410c', label: 'L' },
}

export default function Attendance() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [summary, setSummary] = useState(null)
  const [selected, setSelected] = useState(null)  // employee_id
  const [dailyCache, setDailyCache] = useState({}) // emp_id -> records[]
  const [loadingMain, setLoadingMain] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [baseSalaryEdit, setBaseSalaryEdit] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoadingMain(true)
    setSelected(null)
    setDailyCache({})
    try {
      const r = await api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`)
      setSummary(r.data)
    } finally {
      setLoadingMain(false)
    }
  }

  useEffect(() => { load() }, [month, year])

  const selectTech = async (empId) => {
    if (selected === empId) { setSelected(null); return }
    setSelected(empId)
    if (dailyCache[empId]) return
    setLoadingDetail(true)
    try {
      const r = await api.get(`/api/attendance/?employee_id=${empId}&month=${month}&year=${year}`)
      setDailyCache(c => ({ ...c, [empId]: r.data }))
    } finally {
      setLoadingDetail(false)
    }
  }

  const saveBaseSalary = async (empId) => {
    if (!baseSalaryEdit) return
    setSaving(true)
    await api.patch(`/api/attendance/base-salary/${empId}?salary=${baseSalaryEdit}`)
    setSaving(false)
    setBaseSalaryEdit('')
    load()
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y)

  // Build calendar days for selected month
  const buildCalendar = (yr, mo) => {
    const daysInMonth = new Date(yr, mo, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(yr, mo - 1, d)
      const dow = dt.getDay()
      const isSunday = dow === 0
      days.push({ day: d, dow, isSunday, dateStr: `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}` })
    }
    return days
  }

  const calDays = buildCalendar(year, month)
  const selectedEmp = summary?.technicians.find(t => t.employee_id === selected)
  const dailyRecords = selected ? (dailyCache[selected] || []) : []
  const recordByDate = {}
  dailyRecords.forEach(r => { recordByDate[r.date] = r })

  return (
    <div style={{ padding: '1rem', maxWidth: 1100 }}>
      <h2 style={{ marginBottom: '1rem' }}>Attendance</h2>

      {/* Month/Year picker */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, background: 'var(--surface)' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, background: 'var(--surface)' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {summary && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary,#888)' }}>
            Working days: <b>{summary.working_days}</b>
          </span>
        )}
      </div>

      {loadingMain && <p style={{ color: '#888' }}>Loading...</p>}

      {summary && summary.technicians.length === 0 && (
        <p style={{ color: '#888' }}>No technicians found.</p>
      )}

      {summary && summary.technicians.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          {/* Technician cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {summary.technicians.map(emp => {
              const isActive = selected === emp.employee_id
              const pct = emp.attendance_pct
              const pctColor = pct >= 80 ? '#15803d' : pct >= 50 ? '#a16207' : '#b91c1c'
              return (
                <div key={emp.employee_id}
                  onClick={() => { selectTech(emp.employee_id); setBaseSalaryEdit('') }}
                  style={{
                    padding: '0.9rem 1rem', borderRadius: 10, cursor: 'pointer',
                    border: isActive ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: isActive ? '#eff6ff' : 'var(--surface,#fff)',
                    transition: 'all 0.15s'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{emp.employee_name}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{emp.employee_code || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: pctColor }}>{pct}%</div>
                      <div style={{ fontSize: 11, color: '#888' }}>attendance</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: '0.6rem', fontSize: 12 }}>
                    <span style={{ color: '#15803d' }}>✓ {emp.present} present</span>
                    <span style={{ color: '#a16207' }}>½ {emp.half_day} half</span>
                    <span style={{ color: '#b91c1c' }}>✗ {emp.absent} absent</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          {selected && selectedEmp && (
            <div style={{ background: 'var(--surface,#fff)', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{selectedEmp.employee_name}</h3>
                  <span style={{ fontSize: 12, color: '#888' }}>{selectedEmp.employee_code} · {MONTHS[month-1]} {year}</span>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', lineHeight: 1 }}>✕</button>
              </div>

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem', marginBottom: '1.25rem' }}>
                <StatCard label="Present" value={selectedEmp.present} color="#15803d" bg="#dcfce7" />
                <StatCard label="Half Day" value={selectedEmp.half_day} color="#a16207" bg="#fef9c3" />
                <StatCard label="Absent" value={selectedEmp.absent} color="#b91c1c" bg="#fee2e2" />
                <StatCard label="Att %" value={`${selectedEmp.attendance_pct}%`}
                  color={selectedEmp.attendance_pct >= 80 ? '#15803d' : '#b91c1c'} bg="#f0f4ff" />
                <StatCard label="Calc Salary" value={`₹${Number(selectedEmp.calculated_salary).toLocaleString()}`} color="#2563eb" bg="#eff6ff" />
              </div>

              {/* Base salary edit */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1.25rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: '#555' }}>Base Salary:</span>
                <b style={{ fontSize: 14 }}>₹{Number(selectedEmp.base_salary).toLocaleString()}</b>
                <input
                  type="number"
                  placeholder="Override..."
                  value={baseSalaryEdit}
                  onChange={e => setBaseSalaryEdit(e.target.value)}
                  style={{ width: 100, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                />
                <button onClick={() => saveBaseSalary(selected)} disabled={saving || !baseSalaryEdit}
                  style={{ padding: '0.3rem 0.8rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {saving ? '…' : 'Save'}
                </button>
              </div>

              {/* Calendar */}
              {loadingDetail ? <p style={{ color: '#888', fontSize: 13 }}>Loading calendar...</p> : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                    {DAY_NAMES.map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#888', fontWeight: 600, padding: '4px 0' }}>{d}</div>
                    ))}
                  </div>
                  <CalendarGrid calDays={calDays} recordByDate={recordByDate} />
                  <div style={{ display: 'flex', gap: 12, marginTop: '0.75rem', fontSize: 12, flexWrap: 'wrap' }}>
                    {Object.entries(STATUS_STYLE).map(([k, v]) => (
                      <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: v.bg, border: `1px solid ${v.color}` }} />
                        {k === 'half_day' ? 'Half Day' : k.charAt(0).toUpperCase() + k.slice(1)}
                      </span>
                    ))}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: '#f1f5f9', border: '1px solid #cbd5e1' }} />
                      No record
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: '#f1f5f9', border: '1px dashed #94a3b8' }} />
                      Sunday (off)
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CalendarGrid({ calDays, recordByDate }) {
  const firstDow = calDays[0]?.dow || 0
  const blanks = Array(firstDow).fill(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
      {blanks.map((_, i) => <div key={`b${i}`} />)}
      {calDays.map(({ day, isSunday, dateStr }) => {
        const rec = recordByDate[dateStr]
        const s = rec ? STATUS_STYLE[rec.status] : null
        return (
          <div key={day} title={rec ? rec.status : isSunday ? 'Sunday' : 'No record'}
            style={{
              aspectRatio: '1', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12,
              background: s ? s.bg : '#f1f5f9',
              border: isSunday && !rec ? '1px dashed #94a3b8' : `1px solid ${s ? s.color+'44' : '#cbd5e1'}`,
              color: s ? s.color : isSunday ? '#94a3b8' : '#64748b',
              fontWeight: s ? 700 : 400,
            }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{day}</span>
            {s && <span style={{ fontSize: 10, fontWeight: 800 }}>{s.label}</span>}
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '0.6rem 0.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{label}</div>
    </div>
  )
}
