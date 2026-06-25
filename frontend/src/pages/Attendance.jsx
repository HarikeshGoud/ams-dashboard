import { useEffect, useState } from 'react'
import api from '../api/axios'

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export default function Attendance() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [overrides, setOverrides] = useState({})
  const [saving, setSaving] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/attendance/monthly-summary?month=${month}&year=${year}`)
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [month, year])

  const saveSalary = async (empId, val) => {
    setSaving(s => ({ ...s, [empId]: true }))
    await api.patch(`/api/attendance/base-salary/${empId}?salary=${val}`)
    setSaving(s => ({ ...s, [empId]: false }))
    setOverrides(o => { const n = { ...o }; delete n[empId]; return n })
    load()
  }

  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y)

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Attendance — Monthly Overview</h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {data && <span style={{ color: '#666', fontSize: 13 }}>Working days this month: <b>{data.working_days}</b></span>}
      </div>

      {loading && <p>Loading...</p>}

      {data && data.technicians.length === 0 && !loading && (
        <p style={{ color: '#888' }}>No technicians found.</p>
      )}

      {data && data.technicians.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f0f4ff', textAlign: 'left' }}>
                {['Employee','Code','Base Salary','Total Days','Present','Half Day','Absent','Att %','Calc Salary','Set Base Salary'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.8rem', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.technicians.map(emp => {
                const pct = emp.attendance_pct
                const pctColor = pct >= 80 ? '#16a34a' : pct >= 60 ? '#ca8a04' : '#dc2626'
                const ovr = overrides[emp.employee_id]
                const curVal = ovr !== undefined ? ovr : emp.base_salary
                return (
                  <tr key={emp.employee_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{emp.employee_name}</td>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#666' }}>{emp.employee_code || '—'}</td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>₹{Number(emp.base_salary).toLocaleString()}</td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>{emp.working_days}</td>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#16a34a', fontWeight: 600 }}>{emp.present}</td>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#ca8a04' }}>{emp.half_day}</td>
                    <td style={{ padding: '0.6rem 0.8rem', color: '#dc2626' }}>{emp.absent}</td>
                    <td style={{ padding: '0.6rem 0.8rem', color: pctColor, fontWeight: 600 }}>{pct}%</td>
                    <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700, color: '#2563eb' }}>
                      ₹{Number(emp.calculated_salary).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          type="number"
                          value={curVal}
                          onChange={e => setOverrides(o => ({ ...o, [emp.employee_id]: e.target.value }))}
                          style={{ width: 90, padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                        />
                        <button
                          onClick={() => saveSalary(emp.employee_id, curVal)}
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
    </div>
  )
}
