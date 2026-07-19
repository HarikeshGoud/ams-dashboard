import { useState, useEffect } from 'react'
import api from '../../api/axios'

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function MySalary() {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear  = now.getFullYear()

  const [history, setHistory] = useState([])   // [{month, year, summary, override}]
  const [loading, setLoading]  = useState(true)
  const [selected, setSelected] = useState(null) // index into history

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    // Build last 12 months
    const months = []
    for (let i = 0; i < 12; i++) {
      let m = currentMonth - i
      let y = currentYear
      if (m <= 0) { m += 12; y -= 1 }
      months.push({ month: m, year: y })
    }

    try {
      const results = await Promise.all(
        months.map(({ month, year }) =>
          api.get(`/api/attendance/my-summary?month=${month}&year=${year}`)
            .then(r => ({ month, year, summary: r.data }))
            .catch(() => ({ month, year, summary: null }))
        )
      )
      // Filter to months that have at least some attendance data or are current month
      const filtered = results.filter(r =>
        r.summary && (
          r.month === currentMonth && r.year === currentYear ||
          r.summary.present > 0 || r.summary.half_day > 0 || r.summary.absent > 0
        )
      )
      setHistory(filtered)
      if (filtered.length > 0) setSelected(0)
    } finally {
      setLoading(false)
    }
  }

  const cur = selected !== null ? history[selected] : null
  const s = cur?.summary

  const totalPaid = history.reduce((sum, h) => sum + (h.summary?.calculated_salary || 0), 0)

  const pctColor = (pct) => pct >= 80 ? 'var(--green)' : pct >= 50 ? '#ca8a04' : 'var(--red)'

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>My Salary</h2>

      {loading && <p style={{ color: '#888' }}>Loading...</p>}

      {!loading && history.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          No salary records found yet.
        </div>
      )}

      {!loading && history.length > 0 && (
        <>
          {/* Total summary card */}
          <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '1rem 1.25rem', marginBottom: '1.25rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#888' }}>Total Earnings ({history.length} months)</div>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#2563eb' }}>₹{totalPaid.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#888' }}>Base Salary</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>₹{Number(history[0]?.summary?.base_salary || 10000).toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected !== null ? '220px 1fr' : '1fr', gap: '1rem', alignItems: 'start' }}>

            {/* Month list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {history.map((h, idx) => {
                const pct = h.summary?.attendance_pct || 0
                const salary = h.summary?.calculated_salary || 0
                const isActive = selected === idx
                return (
                  <div key={`${h.month}-${h.year}`} onClick={() => setSelected(idx)}
                    style={{ padding: '0.75rem 1rem', borderRadius: 10, cursor: 'pointer',
                      border: isActive ? '2px solid #2563eb' : '1px solid var(--border)',
                      background: isActive ? 'var(--surface2)' : 'var(--surface,#fff)',
                      transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{MONTHS[h.month]} {h.year}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#2563eb' }}>
                        ₹{Number(salary).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12 }}>
                      <span style={{ color: pctColor(pct), fontWeight: 600 }}>{pct}% att.</span>
                      <span style={{ color: '#15803d' }}>✓{h.summary?.present}</span>
                      <span style={{ color: '#ca8a04' }}>½{h.summary?.half_day}</span>
                      <span style={{ color: '#b91c1c' }}>✗{h.summary?.absent}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detail panel */}
            {cur && s && (
              <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: 17 }}>{MONTHS[cur.month]} {cur.year}</h3>

                {/* Salary breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <SalaryCard label="Base Salary"    value={`₹${Number(s.base_salary).toLocaleString('en-IN')}`}       color="#475569" bg="var(--surface2)" />
                  <SalaryCard label="Working Days"   value={s.working_days}                                              color="#475569" bg="var(--surface2)" />
                  <SalaryCard label="Days Present"   value={`${s.present} + ½×${s.half_day} = ${s.effective_days}`}    color="#15803d" bg="#dcfce7" />
                  <SalaryCard label="Attendance"     value={`${s.attendance_pct}%`}                                     color={pctColor(s.attendance_pct)} bg="var(--surface2)" />
                </div>

                {/* Salary formula */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Salary Calculation</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    ₹{Number(s.base_salary).toLocaleString()} × {s.effective_days} ÷ {s.working_days} =&nbsp;
                    <b style={{ color: '#2563eb', fontSize: 15 }}>₹{Number(s.calculated_salary).toLocaleString('en-IN')}</b>
                  </div>
                </div>

                {/* Attendance breakdown */}
                <div className="grid-3" style={{ gap: '0.6rem', marginBottom: '1rem' }}>
                  <AttBox label="Present"  value={s.present}  color="#15803d" bg="#dcfce7" />
                  <AttBox label="Half Day" value={s.half_day} color="#a16207" bg="#fef9c3" />
                  <AttBox label="Absent"   value={s.absent}   color="#b91c1c" bg="#fee2e2" />
                </div>

                {/* Attendance bar */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
                    <span>Attendance</span>
                    <span>{s.attendance_pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(s.attendance_pct, 100)}%`,
                      background: s.attendance_pct >= 80 ? '#22c55e' : s.attendance_pct >= 50 ? '#f59e0b' : '#ef4444',
                      borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SalaryCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem 0.9rem' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color }}>{value}</div>
    </div>
  )
}

function AttBox({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '0.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  )
}
