import { useState, useEffect } from 'react'
import api from '../../api/axios'

const STATUS_COLOR = { present: 'var(--green)', absent: 'var(--red)', half_day: 'var(--yellow)', leave: '#f97316' }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DeskAttendance() {
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [toast, setToast] = useState('')
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/api/attendance/', { params: { month, year, ...(filterEmp ? { employee_id: filterEmp } : {}) } }),
      api.get('/api/employees/')
    ]).then(([a, e]) => {
      setRecords(a.data)
      setEmployees(e.data.filter(emp => emp.role === 'technician'))
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [month, year, filterEmp])

  async function autoCalc() {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-01`
    // calculate for each day of the month up to today
    const today = new Date().toISOString().slice(0, 10)
    try {
      const r = await api.post('/api/tasks/auto-attendance', null, { params: { task_date: today } })
      showToast(`✅ Auto-calculated for ${r.data.processed} employees`)
      load()
    } catch { showToast('Failed to auto-calculate') }
  }

  // group records by employee
  const grouped = {}
  records.forEach(r => {
    if (!grouped[r.employee_id]) grouped[r.employee_id] = { name: r.employee_name, records: [] }
    grouped[r.employee_id].records.push(r)
  })

  const summary = Object.entries(grouped).map(([id, g]) => ({
    id, name: g.name,
    present: g.records.filter(r => r.status === 'present').length,
    absent: g.records.filter(r => r.status === 'absent').length,
    half: g.records.filter(r => r.status === 'half_day').length,
    leave: g.records.filter(r => r.status === 'leave').length,
    records: g.records
  }))

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📅 Attendance Management</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={autoCalc}>⚡ Auto-Calculate Today</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}>
          {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} [{e.employee_code}]</option>)}
        </select>
      </div>

      {loading ? <div className="spinner" /> : summary.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No attendance records found.</div>
      ) : (
        summary.map(s => (
          <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--green)' }}>✅ {s.present}P</span>
                <span style={{ color: 'var(--red)' }}>❌ {s.absent}A</span>
                <span style={{ color: 'var(--yellow)' }}>½ {s.half}H</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {s.records.sort((a, b) => a.date.localeCompare(b.date)).map(r => (
                <div key={r.id} title={`${r.date} — ${r.status}${r.notes ? ' | ' + r.notes : ''}`}
                  style={{
                    width: 32, height: 32, borderRadius: 6, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                    background: `${STATUS_COLOR[r.status] || 'var(--muted)'}22`,
                    border: `1px solid ${STATUS_COLOR[r.status] || 'var(--border)'}`,
                    color: STATUS_COLOR[r.status] || 'var(--muted)', cursor: 'default'
                  }}>
                  <span>{r.date.slice(8)}</span>
                  {r.attendance_label && <span style={{ fontSize: 8 }}>{r.attendance_label.slice(0, 3)}</span>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
