import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

const STATUS_COLOR = { present: 'var(--green)', absent: 'var(--red)', leave: 'var(--yellow)', half_day: '#f97316' }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function MyAttendance() {
  const { user } = useAuthStore()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    setLoading(true)
    api.get('/api/attendance/', { params: { employee_id: user?.id, month, year } })
      .then(r => { setRecords(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month, year])

  const present  = records.filter(r => r.status === 'present').length
  const absent   = records.filter(r => r.status === 'absent').length
  const leave    = records.filter(r => r.status === 'leave').length

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📅 My Attendance</h3>
      </div>

      {/* Month picker */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={{ flex: 1 }}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}>
          {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[['✅ Present', present, 'var(--green)', 'rgba(52,211,153,.1)'],
          ['❌ Absent',  absent,  'var(--red)',   'rgba(248,113,113,.1)'],
          ['🏖️ Leave',   leave,   'var(--yellow)','rgba(251,191,36,.1)']
        ].map(([label, count, color, bg]) => (
          <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${color}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{count}</div>
            <div style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="spinner" /> : records.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          No records for this month.
        </div>
      ) : (
        records.map(r => (
          <div key={r.id} style={{
            background: 'var(--surface)', border: `1px solid ${STATUS_COLOR[r.status] || 'var(--border)'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.date}</div>
              {r.check_in && <div style={{ fontSize: 11, color: 'var(--muted)' }}>In: {r.check_in}{r.check_out ? ` · Out: ${r.check_out}` : ''}</div>}
              {r.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>📝 {r.notes}</div>}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
              background: `${STATUS_COLOR[r.status] || 'var(--muted)'}22`,
              color: STATUS_COLOR[r.status] || 'var(--muted)',
              textTransform: 'capitalize'
            }}>{r.status}</span>
          </div>
        ))
      )}
    </div>
  )
}
