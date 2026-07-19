import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function ServiceReports() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    api.get('/api/service-reports/')
      .then(r => { setReports(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = reports.filter(r =>
    !search ||
    r.school_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.report_date?.includes(search)
  )

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h3>📄 Service Reports</h3>
      </div>

      {/* Summary */}
      <div className="grid-3" style={{ gap: 10, marginBottom: 16 }}>
        {[
          ['📄 Total Reports',  reports.length,                             'var(--accent)'],
          ['✅ With Signatures', reports.filter(r => r.pdf_url).length,     'var(--green)'],
          ['⏳ Pending PDF',    reports.filter(r => !r.pdf_url).length,     'var(--yellow)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by school, technician or date…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
      />

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          No service reports yet.
        </div>
      ) : (
        filtered.map(r => (
          <div key={r.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>🏫 {r.school_name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  👷 {r.employee_name} · 📅 {r.report_date}
                  {r.principal_name && <> · 🧑‍💼 {r.principal_name}</>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                  background: r.pdf_url ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.15)',
                  color: r.pdf_url ? 'var(--green)' : 'var(--yellow)'
                }}>
                  {r.pdf_url ? '✅ PDF Ready' : '⏳ No PDF'}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                  background: r.serial_no ? 'rgba(52,211,153,.15)' : 'rgba(148,163,184,.15)',
                  color: r.serial_no ? 'var(--green)' : 'var(--muted)'
                }}>
                  {r.serial_no ? `🔖 ${r.serial_no}` : '🔖 Pending verification'}
                </span>
              </div>
            </div>

            {/* Work summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {r.spare_parts && (
                <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'var(--surface2)', gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PARTS: </span>{r.spare_parts}
                </div>
              )}
              {r.problem_description && (
                <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'var(--surface2)' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PROBLEM: </span>{r.problem_description}
                </div>
              )}
              {r.action_taken && (
                <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'var(--surface2)' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>ACTION: </span>{r.action_taken}
                </div>
              )}
            </div>

            {/* Readings */}
            {(r.tds_input != null || r.tds_output != null || r.voltage != null || r.flow_rate != null) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                {r.tds_input   != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>TDS In: <b style={{ color: 'var(--text)' }}>{r.tds_input} ppm</b></span>}
                {r.tds_output  != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>TDS Out: <b style={{ color: 'var(--green)' }}>{r.tds_output} ppm</b></span>}
                {r.voltage     != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Voltage: <b style={{ color: 'var(--text)' }}>{r.voltage} V</b></span>}
                {r.flow_rate   != null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Flow: <b style={{ color: 'var(--text)' }}>{r.flow_rate} LPH</b></span>}
              </div>
            )}

            {/* Download button */}
            {r.pdf_url ? (
              <a href={r.pdf_url} target="_blank" rel="noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
                borderRadius: 8, background: 'var(--accent)', color: '#fff',
                fontWeight: 700, fontSize: 12, textDecoration: 'none'
              }}>
                📥 Download PDF
              </a>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>PDF not yet generated — technician must complete signatures on the app.</span>
            )}
          </div>
        ))
      )}
    </div>
  )
}
