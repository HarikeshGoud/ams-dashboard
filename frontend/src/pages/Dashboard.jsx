import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [visits, setVisits] = useState([])
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    api.get('/api/dashboard/stats').then(r => setStats(r.data)).catch(() => {})
    api.get('/api/dashboard/recent-visits').then(r => setVisits(r.data)).catch(() => {})
    api.get('/api/dashboard/alerts').then(r => setAlerts(r.data)).catch(() => {})
  }, [])

  if (!stats) return <div className="spinner" />

  const kpis = [
    { label: 'Total Schools',     value: stats.total_schools,       color: 'green',  sub: 'Active sites' },
    { label: 'Employees',         value: stats.total_employees,     color: 'cyan',   sub: '5 teams' },
    { label: 'Open Complaints',   value: stats.open_complaints,     color: 'red',    sub: 'Needs attention' },
    { label: 'Visits This Month', value: stats.visits_this_month,   color: '',       sub: 'Field visits' },
    { label: 'Low Stock Items',   value: stats.low_stock_items,     color: 'yellow', sub: 'Below threshold' },
    { label: 'Pending Invoices',  value: stats.pending_invoices,    color: 'purple', sub: 'Awaiting approval' },
    { label: 'Overdue Schools',   value: stats.overdue_schools,     color: 'red',    sub: '>90 days no visit' },
  ]

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value ?? '—'}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">⚠️ Active Alerts</div>
          {alerts.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No active alerts</div>
          ) : alerts.map((a, i) => (
            <div key={i} className={`alert ${a.type === 'error' ? 'alert-red' : 'alert-yellow'}`}>
              <span>{a.type === 'error' ? '🔴' : '🟡'}</span>
              <div>{a.message}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">🕐 Recent Visits</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Employee</th><th>School</th><th>TDS</th><th>Type</th></tr>
              </thead>
              <tbody>
                {visits.map(v => (
                  <tr key={v.id}>
                    <td>{v.date}</td>
                    <td>{v.employee}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.school}</td>
                    <td>{v.tds ?? '—'}</td>
                    <td><span className="pill pill-blue">{v.type}</span></td>
                  </tr>
                ))}
                {visits.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No visits yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
