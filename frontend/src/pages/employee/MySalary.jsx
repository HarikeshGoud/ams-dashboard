import { useState, useEffect } from 'react'
import api from '../../api/axios'

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function MySalary() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/salary/')
      .then(r => { setRecords(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const total = records.reduce((s, r) => s + r.net_salary, 0)

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h3>💰 My Salary</h3>
      </div>

      {records.length > 0 && (
        <div style={{ background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total Paid ({records.length} months)</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)' }}>₹{total.toLocaleString('en-IN')}</div>
        </div>
      )}

      {loading ? <div className="spinner" /> : records.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          No salary records found.
        </div>
      ) : (
        records.map(r => (
          <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{MONTHS[r.month]} {r.year}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                background: r.status === 'paid' ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.15)',
                color: r.status === 'paid' ? 'var(--green)' : 'var(--yellow)'
              }}>{r.status === 'paid' ? '✅ Paid' : '⏳ Pending'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
              <div><span style={{ color: 'var(--muted)' }}>Basic: </span>₹{r.basic_salary.toLocaleString('en-IN')}</div>
              <div><span style={{ color: 'var(--muted)' }}>Allowances: </span><span style={{ color: 'var(--green)' }}>+₹{r.allowances.toLocaleString('en-IN')}</span></div>
              <div><span style={{ color: 'var(--muted)' }}>Deductions: </span><span style={{ color: 'var(--red)' }}>-₹{r.deductions.toLocaleString('en-IN')}</span></div>
              <div><span style={{ color: 'var(--muted)' }}>Net: </span><b style={{ color: 'var(--accent2)' }}>₹{r.net_salary.toLocaleString('en-IN')}</b></div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
