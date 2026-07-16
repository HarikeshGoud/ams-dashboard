import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TODAY = new Date().toISOString().slice(0, 10)
const THIS_YEAR = new Date().getFullYear()
const THIS_MONTH = new Date().getMonth() + 1

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN') : '-' }
function pad(n) { return String(n).padStart(2, '0') }
function monthLabel(y, m) { return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${y}` }

function condBadge(c) {
  const map = { working: ['#198754', 'Resolved'], not_working: ['#dc3545', 'Unresolved'] }
  const [color, label] = map[c] || ['#6c757d', c || '-']
  return <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>{label}</span>
}

// ── PDF generators ─────────────────────────────────────────────────────────
function pdfHeader(doc, title, subtitle) {
  const W = 210, m = 10
  doc.setFillColor(13, 110, 253)
  doc.rect(0, 0, W, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('SRI HAMSINI & CHANDRA ENTERPRISES', W / 2, 9, { align: 'center' })
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('2-1-49/244 Park St, Suryanagar Colony, Uppal, Hyderabad – 500039  |  Tel: 7670873623', W / 2, 15, { align: 'center' })
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text(title, W / 2, 22, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  if (subtitle) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(subtitle, m, 32)
  }
  return subtitle ? 36 : 30
}

function downloadDailyPDF(visits, date) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const y = pdfHeader(doc, 'DAILY VISIT REPORT', `Date: ${fmtDate(date)}   Total Visits: ${visits.length}`)

  const cols = ['S.No', 'School / Village', 'Mandal', 'Technician', 'Plant Condition', 'Reason (Not Working)', 'MCF Used', 'Antiscalant (L)', 'Spares Used', 'Remarks']
  const rows = visits.map((v, i) => [
    i + 1,
    v.school_name || '-',
    v.mandal_name || '-',
    v.employee_name || '-',
    v.plant_condition?.replace(/_/g, ' ') || '-',
    v.not_working_reason || '-',
    v.mcf_used ?? 0,
    v.antiscalant_used ?? 0,
    v.spares_used || '-',
    v.remarks || '-',
  ])

  autoTable(doc, {
    startY: y,
    head: [cols],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    margin: { left: 10, right: 10 },
    columnStyles: { 1: { cellWidth: 38 }, 5: { cellWidth: 28 }, 8: { cellWidth: 30 } },
  })

  // Summary
  const fy = doc.lastAutoTable.finalY + 6
  const working = visits.filter(v => v.plant_condition === 'working').length
  autoTable(doc, {
    startY: fy,
    head: [['Summary', '']],
    body: [
      ['Total Visits', visits.length],
      ['Plants Working', working],
      ['Plants Not Working', visits.filter(v => v.plant_condition === 'not_working').length],
      ['Total MCF Used', visits.reduce((s, v) => s + (v.mcf_used || 0), 0)],
      ['Total Antiscalant (L)', visits.reduce((s, v) => s + (v.antiscalant_used || 0), 0).toFixed(2)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    margin: { left: 10, right: 200 },
  })

  doc.save(`Daily_Report_${date}.pdf`)
}

function downloadMonthlyPDF(visits, label, months) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const y = pdfHeader(doc, `${months === 3 ? '3-MONTH (AMC CYCLE)' : 'MONTHLY'} VISIT REPORT`, `Period: ${label}   Total Visits: ${visits.length}`)

  const cols = ['S.No', 'School / Village', 'Mandal', 'Visit Date', 'Technician', 'Plant Condition', 'Reason (Not Working)', 'MCF Used', 'Antiscalant (L)', 'Spares Used']
  const rows = visits.map((v, i) => [
    i + 1,
    v.school_name || '-',
    v.mandal_name || '-',
    fmtDate(v.visit_date),
    v.employee_name || '-',
    v.plant_condition?.replace(/_/g, ' ') || '-',
    v.not_working_reason || '-',
    v.mcf_used ?? 0,
    v.antiscalant_used ?? 0,
    v.spares_used || '-',
  ])

  autoTable(doc, {
    startY: y,
    head: [cols],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    margin: { left: 10, right: 10 },
    columnStyles: { 1: { cellWidth: 38 }, 6: { cellWidth: 28 }, 9: { cellWidth: 30 } },
  })

  // Technician-wise summary
  const techMap = {}
  visits.forEach(v => {
    const n = v.employee_name || 'Unknown'
    if (!techMap[n]) techMap[n] = { visits: 0, mcf: 0, anti: 0 }
    techMap[n].visits++
    techMap[n].mcf += (v.mcf_used || 0)
    techMap[n].anti += (v.antiscalant_used || 0)
  })

  const fy = doc.lastAutoTable.finalY + 6
  autoTable(doc, {
    startY: fy,
    head: [['Technician', 'Total Visits', 'MCF Used', 'Antiscalant (L)']],
    body: Object.entries(techMap).map(([n, s]) => [n, s.visits, s.mcf, s.anti.toFixed(2)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 167, 69], textColor: 255 },
    margin: { left: 10, right: 160 },
  })

  // Spares billing summary
  autoTable(doc, {
    startY: fy,
    head: [['Overall Summary', '']],
    body: [
      ['Total Visits', visits.length],
      ['Plants Working', visits.filter(v => v.plant_condition === 'working').length],
      ['Plants Not Working', visits.filter(v => v.plant_condition === 'not_working').length],
      ['Total MCF Filters Used', visits.reduce((s, v) => s + (v.mcf_used || 0), 0)],
      ['Total Antiscalant (L)', visits.reduce((s, v) => s + (v.antiscalant_used || 0), 0).toFixed(2)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    margin: { left: 155, right: 10 },
  })

  doc.save(`${months === 3 ? 'AMC_Cycle' : 'Monthly'}_Report_${label.replace(/\s/g, '_')}.pdf`)
}

// ── Stat card ──────────────────────────────────────────────────────────────
function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '10px 16px', minWidth: 100 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────
function VisitTable({ visits, showDate }) {
  if (!visits.length) return (
    <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 50, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
      No visits found for the selected period.
    </div>
  )
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface2)' }}>
            <th style={th}>S.No</th>
            <th style={th}>School / Village</th>
            <th style={th}>Mandal</th>
            {showDate && <th style={th}>Visit Date</th>}
            <th style={th}>Technician</th>
            <th style={th}>Plant Condition</th>
            <th style={th}>Reason (Not Working)</th>
            <th style={th}>MCF Used</th>
            <th style={th}>Antiscalant (L)</th>
            <th style={th}>Spares Used</th>
            <th style={th}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v, i) => (
            <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontWeight: 600 }}>{v.school_name || '-'}</td>
              <td style={td}>{v.mandal_name || '-'}</td>
              {showDate && <td style={td}>{fmtDate(v.visit_date)}</td>}
              <td style={td}>{v.employee_name || '-'}</td>
              <td style={td}>{condBadge(v.plant_condition)}</td>
              <td style={{ ...td, color: 'var(--muted)', fontSize: 12 }}>{v.not_working_reason || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{v.mcf_used ?? 0}</td>
              <td style={{ ...td, textAlign: 'center' }}>{v.antiscalant_used ?? 0}</td>
              <td style={{ ...td, fontSize: 12 }}>{v.spares_used || '-'}</td>
              <td style={{ ...td, fontSize: 12, color: 'var(--muted)' }}>{v.remarks || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Technician summary ─────────────────────────────────────────────────────
function TechSummary({ visits }) {
  const map = {}
  visits.forEach(v => {
    const n = v.employee_name || 'Unknown'
    if (!map[n]) map[n] = { visits: 0, mcf: 0, anti: 0 }
    map[n].visits++
    map[n].mcf += (v.mcf_used || 0)
    map[n].anti += (v.antiscalant_used || 0)
  })
  const rows = Object.entries(map)
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>Technician-wise Summary</div>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={th}>Technician</th>
              <th style={th}>Total Visits</th>
              <th style={th}>MCF Filters Used</th>
              <th style={th}>Antiscalant (L)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, s], i) => (
              <tr key={name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                <td style={{ ...td, textAlign: 'center' }}>{s.visits}</td>
                <td style={{ ...td, textAlign: 'center' }}>{s.mcf}</td>
                <td style={{ ...td, textAlign: 'center' }}>{s.anti.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── DAILY REPORT ───────────────────────────────────────────────────────────
function DailyReport() {
  const [date, setDate] = useState(TODAY)
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (d) => {
    setLoading(true)
    try {
      const r = await api.get(`/api/visits/?limit=500&date_from=${d}&date_to=${d}`)
      setVisits(r.data?.items || r.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>Select Date</label>
          <input type="date" value={date} max={TODAY} onChange={e => setDate(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }} />
        </div>
        <button onClick={() => downloadDailyPDF(visits, date)}
          style={{ marginTop: 18, background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          ⬇ Download PDF
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--muted)', padding: 30 }}>Loading...</div> : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <Stat label="Total Visits" value={visits.length} color="var(--accent)" />
            <Stat label="Resolved" value={visits.filter(v => v.plant_condition === 'working').length} color="#198754" />
            <Stat label="Unresolved" value={visits.filter(v => v.plant_condition === 'not_working').length} color="#dc3545" />
            <Stat label="MCF Used" value={visits.reduce((s, v) => s + (v.mcf_used || 0), 0)} color="#fd7e14" />
            <Stat label="Antiscalant (L)" value={visits.reduce((s, v) => s + (v.antiscalant_used || 0), 0).toFixed(1)} color="#6f42c1" />
          </div>
          <VisitTable visits={visits} showDate={false} />
        </>
      )}
    </div>
  )
}

// ── MONTHLY REPORT ─────────────────────────────────────────────────────────
function MonthlyReport({ months }) {
  const [year, setYear] = useState(THIS_YEAR)
  const [month, setMonth] = useState(THIS_MONTH)
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')

  const load = useCallback(async (y, m, mo) => {
    setLoading(true)
    try {
      // For 3-month AMC cycle: fetch 3 months back from selected
      let startM = m - mo + 1, startY = y
      if (startM <= 0) { startM += 12; startY-- }
      const from = `${startY}-${pad(startM)}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const to = `${y}-${pad(m)}-${pad(lastDay)}`
      const r = await api.get(`/api/visits/?limit=2000&date_from=${from}&date_to=${to}`)
      const unique = (r.data?.items || r.data || [])
      unique.sort((a, b) => a.visit_date.localeCompare(b.visit_date))
      setVisits(unique)

      if (mo === 1) setLabel(monthLabel(y, m))
      else setLabel(`${monthLabel(startY, startM)} – ${monthLabel(y, m)}`)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(year, month, months) }, [year, month, months, load])

  const years = Array.from({ length: 4 }, (_, i) => THIS_YEAR - i)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>{months === 3 ? 'Cycle End Month' : 'Month'}</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}>
            {monthNames.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => downloadMonthlyPDF(visits, label, months)}
          style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          ⬇ Download PDF
        </button>
      </div>

      {months === 3 && (
        <div style={{ background: 'rgba(59,158,255,0.08)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13 }}>
          <b>AMC Cycle:</b> {label} &nbsp;·&nbsp; 3-month maintenance period
        </div>
      )}

      {loading ? <div style={{ color: 'var(--muted)', padding: 30 }}>Loading...</div> : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <Stat label="Total Visits" value={visits.length} color="var(--accent)" />
            <Stat label="Resolved" value={visits.filter(v => v.plant_condition === 'working').length} color="#198754" />
            <Stat label="Unresolved" value={visits.filter(v => v.plant_condition === 'not_working').length} color="#dc3545" />
            <Stat label="MCF Used" value={visits.reduce((s, v) => s + (v.mcf_used || 0), 0)} color="#fd7e14" />
            <Stat label="Antiscalant (L)" value={visits.reduce((s, v) => s + (v.antiscalant_used || 0), 0).toFixed(1)} color="#6f42c1" />
          </div>
          <VisitTable visits={visits} showDate={true} />
          <TechSummary visits={visits} />
        </>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Reports() {
  const [mainTab, setMainTab] = useState('daily')   // 'daily' | 'monthly'
  const [subTab, setSubTab] = useState('1m')         // '1m' | '3m'

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>📊 Reports</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Visit reports — daily, monthly, and AMC cycle summaries</div>
      </div>

      {/* Main tabs: Daily | Monthly */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
        {[['daily', '📅 Daily Reports'], ['monthly', '📆 Monthly Reports']].map(([key, label]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: '11px 28px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            background: mainTab === key ? 'var(--accent)' : 'transparent',
            color: mainTab === key ? '#fff' : 'var(--muted)',
            transition: 'all .15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Monthly sub-tabs */}
      {mainTab === 'monthly' && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
          {[['1m', '1 Month'], ['3m', '3 Months (AMC Cycle)']].map(([key, label]) => (
            <button key={key} onClick={() => setSubTab(key)} style={{
              padding: '8px 22px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: subTab === key ? 'rgba(59,158,255,0.15)' : 'transparent',
              color: subTab === key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: subTab === key ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all .15s',
            }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {mainTab === 'daily' && <DailyReport />}
      {mainTab === 'monthly' && subTab === '1m' && <MonthlyReport months={1} key="1m" />}
      {mainTab === 'monthly' && subTab === '3m' && <MonthlyReport months={3} key="3m" />}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const th = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700,
  color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
}
const td = {
  padding: '9px 12px', verticalAlign: 'top', borderBottom: '1px solid var(--border)',
}
