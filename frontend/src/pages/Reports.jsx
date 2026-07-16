import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TODAY = new Date().toISOString().slice(0, 10)
const THIS_YEAR = new Date().getFullYear()
const THIS_MONTH = new Date().getMonth() + 1

const EMPTY_REPORT = { visit_count: 0, working_count: 0, not_working_count: 0, service_reports: [], movements: [], by_item: [], by_technician: [] }

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN') : '-' }
function pad(n) { return String(n).padStart(2, '0') }
function monthLabel(y, m) { return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${y}` }

// The old report's headline consumables — now summed from real stock installs instead of
// Visit fields nothing ever populated. Matched by name since there's no dedicated "type" flag.
function mcfQty(byItem) { return byItem.filter(i => /mcf/i.test(i.item_name)).reduce((s, i) => s + i.total_qty, 0) }
function antiQty(byItem) { return byItem.filter(i => /anti.?scalant/i.test(i.item_name)).reduce((s, i) => s + i.total_qty, 0) }

function statusBadge(status) {
  const resolved = status === 'PROBLEM RESOLVED'
  return <span style={{ background: resolved ? '#198754' : '#dc3545', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>{resolved ? 'Resolved' : 'Unresolved'}</span>
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

function addSummaryAndStock(doc, data, startY, techLabel) {
  let fy = startY
  if (data.movements.length) {
    autoTable(doc, {
      startY: fy,
      head: [['Item Used', 'Qty', 'Technician', 'School / Site']],
      body: data.movements.map(m => [m.item_name, `${m.quantity} ${m.unit}`.trim(), m.employee_name, m.school_dest || '-']),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [111, 66, 193], textColor: 255 },
      margin: { left: 10, right: 10 },
    })
    fy = doc.lastAutoTable.finalY + 6
  }
  if (techLabel && data.by_technician.length) {
    autoTable(doc, {
      startY: fy,
      head: [['Technician', 'Total Items Used']],
      body: data.by_technician.map(t => [t.employee_name, t.items_used_qty]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 167, 69], textColor: 255 },
      margin: { left: 10, right: 160 },
    })
  }
  autoTable(doc, {
    startY: fy,
    head: [['Summary', '']],
    body: [
      ['Total Visits', data.visit_count],
      ['Resolved', data.working_count],
      ['Unresolved', data.not_working_count],
      ['Total MCF Used', mcfQty(data.by_item)],
      ['Total Antiscalant Used', antiQty(data.by_item)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    margin: techLabel ? { left: 155, right: 10 } : { left: 10, right: 200 },
  })
}

function downloadDailyPDF(data, date) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const y = pdfHeader(doc, 'DAILY SERVICE REPORT', `Date: ${fmtDate(date)}   Total Visits: ${data.visit_count}`)

  const cols = ['S.No', 'School / Village', 'Mandal', 'Technician', 'Status', 'Complaint No', 'TDS In', 'TDS Out', 'Observation']
  const rows = data.service_reports.map((s, i) => [
    i + 1, s.school_name || '-', s.mandal_name || '-', s.employee_name || '-',
    s.status === 'PROBLEM RESOLVED' ? 'Resolved' : 'Unresolved',
    s.complaint_no || '-', s.tds_input ?? '-', s.tds_output ?? '-', s.observation || '-',
  ])

  autoTable(doc, {
    startY: y, head: [cols], body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    margin: { left: 10, right: 10 },
    columnStyles: { 1: { cellWidth: 38 }, 8: { cellWidth: 40 } },
  })

  addSummaryAndStock(doc, data, doc.lastAutoTable.finalY + 6, false)
  doc.save(`Daily_Report_${date}.pdf`)
}

function downloadMonthlyPDF(data, label, months) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const y = pdfHeader(doc, `${months === 3 ? '3-MONTH (AMC CYCLE)' : 'MONTHLY'} SERVICE REPORT`, `Period: ${label}   Total Visits: ${data.visit_count}`)

  const cols = ['S.No', 'School / Village', 'Mandal', 'Visit Date', 'Technician', 'Status', 'Complaint No', 'TDS In', 'TDS Out']
  const rows = data.service_reports.map((s, i) => [
    i + 1, s.school_name || '-', s.mandal_name || '-', fmtDate(s.report_date), s.employee_name || '-',
    s.status === 'PROBLEM RESOLVED' ? 'Resolved' : 'Unresolved',
    s.complaint_no || '-', s.tds_input ?? '-', s.tds_output ?? '-',
  ])

  autoTable(doc, {
    startY: y, head: [cols], body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 110, 253], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    margin: { left: 10, right: 10 },
    columnStyles: { 1: { cellWidth: 38 } },
  })

  addSummaryAndStock(doc, data, doc.lastAutoTable.finalY + 6, true)
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

// ── Service report table (replaces the old Visit table) ────────────────────
function ServiceReportTable({ reports, showDate }) {
  if (!reports.length) return (
    <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 50, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
      No service reports found for the selected period.
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
            <th style={th}>Status</th>
            <th style={th}>Complaint No</th>
            <th style={th}>TDS In</th>
            <th style={th}>TDS Out</th>
            <th style={th}>Observation</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((s, i) => (
            <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontWeight: 600 }}>{s.school_name || '-'}</td>
              <td style={td}>{s.mandal_name || '-'}</td>
              {showDate && <td style={td}>{fmtDate(s.report_date)}</td>}
              <td style={td}>{s.employee_name || '-'}</td>
              <td style={td}>{statusBadge(s.status)}</td>
              <td style={{ ...td, fontSize: 12 }}>{s.complaint_no || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{s.tds_input ?? '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{s.tds_output ?? '-'}</td>
              <td style={{ ...td, fontSize: 12, color: 'var(--muted)' }}>{s.observation || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Stock used table ─────────────────────────────────────────────────────
function StockUsedTable({ movements }) {
  if (!movements.length) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>Stock Used</div>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={th}>Date</th>
              <th style={th}>Item</th>
              <th style={th}>Qty</th>
              <th style={th}>Technician</th>
              <th style={th}>School / Site</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <td style={td}>{m.date?.slice(0, 10)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{m.item_name}</td>
                <td style={td}>{m.quantity} {m.unit}</td>
                <td style={td}>{m.employee_name}</td>
                <td style={td}>{m.school_dest || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Technician summary ─────────────────────────────────────────────────────
function TechSummary({ byTechnician }) {
  if (!byTechnician.length) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>Technician-wise Stock Usage</div>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={th}>Technician</th>
              <th style={th}>Total Items Used</th>
            </tr>
          </thead>
          <tbody>
            {byTechnician.map((t, i) => (
              <tr key={t.employee_name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{t.employee_name}</td>
                <td style={{ ...td, textAlign: 'center' }}>{t.items_used_qty}</td>
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
  const [data, setData] = useState(EMPTY_REPORT)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (d) => {
    setLoading(true)
    try {
      const r = await api.get('/api/reports/stock-usage', { params: { date_from: d, date_to: d } })
      setData(r.data)
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
        <button onClick={() => downloadDailyPDF(data, date)}
          style={{ marginTop: 18, background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          ⬇ Download PDF
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--muted)', padding: 30 }}>Loading...</div> : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <Stat label="Total Visits" value={data.visit_count} color="var(--accent)" />
            <Stat label="Resolved" value={data.working_count} color="#198754" />
            <Stat label="Unresolved" value={data.not_working_count} color="#dc3545" />
            <Stat label="MCF Used" value={mcfQty(data.by_item)} color="#fd7e14" />
            <Stat label="Antiscalant Used" value={antiQty(data.by_item)} color="#6f42c1" />
          </div>
          <ServiceReportTable reports={data.service_reports} showDate={false} />
          <StockUsedTable movements={data.movements} />
        </>
      )}
    </div>
  )
}

// ── MONTHLY REPORT ─────────────────────────────────────────────────────────
function MonthlyReport({ months }) {
  const [year, setYear] = useState(THIS_YEAR)
  const [month, setMonth] = useState(THIS_MONTH)
  const [data, setData] = useState(EMPTY_REPORT)
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
      const r = await api.get('/api/reports/stock-usage', { params: { date_from: from, date_to: to } })
      setData(r.data)

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
        <button onClick={() => downloadMonthlyPDF(data, label, months)}
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
            <Stat label="Total Visits" value={data.visit_count} color="var(--accent)" />
            <Stat label="Resolved" value={data.working_count} color="#198754" />
            <Stat label="Unresolved" value={data.not_working_count} color="#dc3545" />
            <Stat label="MCF Used" value={mcfQty(data.by_item)} color="#fd7e14" />
            <Stat label="Antiscalant Used" value={antiQty(data.by_item)} color="#6f42c1" />
          </div>
          <ServiceReportTable reports={data.service_reports} showDate={true} />
          <StockUsedTable movements={data.movements} />
          <TechSummary byTechnician={data.by_technician} />
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
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Service reports — daily, monthly, and AMC cycle summaries, backed by real stock &amp; service data</div>
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
