import { useState, useEffect } from 'react'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import SearchableSelect from '../components/SearchableSelect'
import { todayIST } from '../utils/istTime'

const CONDITION_OPTS = ['OK', 'Not OK', 'NA']
const UNIT_TYPES = ['AMC', 'Warranty', 'Chargeable', 'Others']

const EMPTY = {
  report_no: '', complaint_no: '', school_id: '', school_name_manual: '',
  visit_date: todayIST(),
  unit_type: 'AMC', problem_reported: '', observation_action: '',
  spares_required: '', plant_location: '', plant_capacity: '',
  design_rw_tds: '', free_chlorine_rw: '', hours_running: '',
  membrane_condition: 'OK', uv_lamp_condition: 'OK',
  raw_water_tds: '', product_water_tds: '', product_water_flow_lph: '',
  sensors_condition: 'OK', pre_filter_condition: 'OK',
  voltage: '', current_amps: '', spares_consumed: '',
  customer_name: '', customer_mobile: '', customer_remarks: '',
  service_engineer_id: '', service_engineer_name: '',
  problem_resolved: 'resolved',
}

function generatePDF(report) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, margin = 12

  // Header
  doc.setFillColor(13, 110, 253)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('SRI HAMSINI & CHANDRA ENTERPRISES', W / 2, 10, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Office Address: 2-1-49/244, Park Street, Street No. 17, Suryanagar Colony, Uppal, Hyderabad, Telangana - 500039', W / 2, 17, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('WATER PURIFICATION UNIT: INSTALLATION / COMMISSIONING / SERVICE / VISIT REPORT', W / 2, 24, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  let y = 33

  // Report info row
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [220, 230, 255], textColor: 0, fontStyle: 'bold' },
    body: [
      [
        { content: `Report No: ${report.report_no || '-'}`, styles: { fontStyle: 'bold' } },
        { content: `Visit Date: ${report.visit_date || '-'}` },
        { content: `Complaint No: ${report.complaint_no || '-'}` },
        { content: `Unit Type: ${report.unit_type || 'AMC'}`, styles: { fontStyle: 'bold' } },
      ]
    ],
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 44 }, 2: { cellWidth: 50 }, 3: { cellWidth: 48 } },
  })
  y = doc.lastAutoTable.finalY + 1

  // Customer & problem
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    body: [
      [
        { content: 'CUSTOMER NAME & ADDRESS:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'PROBLEM REPORTED:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'OBSERVATION & ACTION TAKEN:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      ],
      [
        { content: report.school_name || report.school_name_manual || '-' },
        { content: report.problem_reported || '-' },
        { content: report.observation_action || '-' },
      ],
      [
        { content: '' },
        { content: `SPARES REQUIRED: ${report.spares_required || 'None'}`, colSpan: 2 },
      ]
    ],
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 62 }, 2: { cellWidth: 62 } },
  })
  y = doc.lastAutoTable.finalY + 1

  // Unit details + plant readings side by side
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    head: [
      [
        { content: 'UNIT DETAILS / SITE CONDITION', colSpan: 2, styles: { fillColor: [13, 110, 253], textColor: 255, halign: 'center' } },
        { content: 'PLANT READINGS', colSpan: 2, styles: { fillColor: [13, 110, 253], textColor: 255, halign: 'center' } },
      ]
    ],
    body: [
      ['Plant Location', report.plant_location || '-', 'Raw Water TDS', report.raw_water_tds || '-'],
      ['Plant Capacity', report.plant_capacity || '-', 'Product Water TDS', report.product_water_tds || '-'],
      ['Design R/W TDS', report.design_rw_tds || '-', 'Product Water Flow in LPH', report.product_water_flow_lph || '-'],
      ['Free Chlorine in R/W', report.free_chlorine_rw || '-', 'Sensors Condition', report.sensors_condition || '-'],
      ['No. of Hours Running', report.hours_running || '-', 'Pre-Filter Condition', report.pre_filter_condition || '-'],
      ['Membrane Condition', report.membrane_condition || '-', 'Voltage', report.voltage || '-'],
      ['UV Lamp Condition', report.uv_lamp_condition || '-', 'Current in Amps', report.current_amps || '-'],
    ],
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold', fillColor: [248, 248, 248] },
      1: { cellWidth: 45 },
      2: { cellWidth: 52, fontStyle: 'bold', fillColor: [248, 248, 248] },
      3: { cellWidth: 44 },
    },
  })
  y = doc.lastAutoTable.finalY + 1

  // Spares consumed
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    head: [[ { content: 'SPARES CONSUMED', styles: { fillColor: [13, 110, 253], textColor: 255 } } ]],
    body: [[ report.spares_consumed || 'None' ]],
    columnStyles: { 0: { cellWidth: 186 } },
  })
  y = doc.lastAutoTable.finalY + 1

  // Customer & engineer signatures
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    body: [
      [
        { content: 'CUSTOMER NAME / MOBILE NUMBER', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'CUSTOMER SIGNATURE & DATE', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      ],
      [
        { content: `${report.customer_name || '-'}\n${report.customer_mobile || ''}` },
        { content: '' },
      ],
      [
        { content: `SERVICE ENGINEER: ${report.service_engineer_name || '-'}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        {
          content: `STATUS: ${report.problem_resolved === 'resolved' ? '✓ PROBLEM RESOLVED' : '✗ PROBLEM UNRESOLVED'}`,
          styles: { fontStyle: 'bold', fillColor: report.problem_resolved === 'resolved' ? [220, 255, 220] : [255, 220, 220] }
        },
      ],
      [
        { content: `Customer Remarks: ${report.customer_remarks || '-'}`, colSpan: 2 },
      ]
    ],
    columnStyles: { 0: { cellWidth: 93 }, 1: { cellWidth: 93 } },
  })
  y = doc.lastAutoTable.finalY + 4

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text('E-mail Id: ch.srini1979@yahoo.com / ch.srini1979@rediffmail.com   Tel No. 7670873623', W / 2, y, { align: 'center' })

  const schoolLabel = (report.school_name || report.school_name_manual || 'Report').replace(/[^a-z0-9]/gi, '_')
  doc.save(`AMC_Report_${schoolLabel}_${report.visit_date || 'date'}.pdf`)
}

function CondSelect({ label, name, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</label>
      <select name={name} value={value} onChange={onChange}
        style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
        {CONDITION_OPTS.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</label>
      {rows
        ? <textarea name={name} value={value} onChange={onChange} rows={rows}
            style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
        : <input type={type} name={name} value={value} onChange={onChange}
            style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
      }
    </div>
  )
}

export default function AMCReports() {
  const [reports, setReports] = useState([])
  const [schools, setSchools] = useState([])
  const [employees, setEmployees] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewReport, setViewReport] = useState(null)

  useEffect(() => {
    load()
    api.get('/api/schools/?limit=200').then(r => setSchools(r.data?.items || r.data || []))
    api.get('/api/employees/').then(r => setEmployees((r.data || []).filter(e => e.role === 'technician' || e.role === 'admin')))
  }, [])

  function load() {
    api.get('/api/amc-reports/').then(r => setReports(r.data || []))
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (name === 'school_id') {
      const s = schools.find(s => String(s.id) === value)
      if (s) setForm(f => ({ ...f, school_id: value, plant_location: s.name, school_name_manual: s.name }))
    }
    if (name === 'service_engineer_id') {
      const emp = employees.find(e => String(e.id) === value)
      if (emp) setForm(f => ({ ...f, service_engineer_id: value, service_engineer_name: emp.name }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, school_id: form.school_id ? Number(form.school_id) : null, service_engineer_id: form.service_engineer_id ? Number(form.service_engineer_id) : null }
      if (editId) await api.put(`/api/amc-reports/${editId}`, payload)
      else await api.post('/api/amc-reports/', payload)
      load()
      setShowForm(false)
      setEditId(null)
      setForm(EMPTY)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(r) {
    setForm({ ...EMPTY, ...r, school_id: r.school_id || '', service_engineer_id: r.service_engineer_id || '' })
    setEditId(r.id)
    setShowForm(true)
    setViewReport(null)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this AMC report?')) return
    await api.delete(`/api/amc-reports/${id}`)
    load()
    setViewReport(null)
  }

  const filtered = reports.filter(r =>
    !search || (r.school_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.report_no || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.service_engineer_name || '').toLowerCase().includes(search.toLowerCase())
  )

  // ---- View modal ----
  if (viewReport) {
    const r = viewReport
    const row = (label, val) => (
      <tr key={label}>
        <td style={{ padding: '5px 10px', fontWeight: 600, color: 'var(--muted)', background: 'var(--surface2)', width: 180, whiteSpace: 'nowrap' }}>{label}</td>
        <td style={{ padding: '5px 10px', color: 'var(--text)' }}>{val || '-'}</td>
      </tr>
    )
    return (
      <div style={{ padding: '16px 20px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setViewReport(null)} style={btnStyle('#444')}>← Back</button>
          <button onClick={() => openEdit(r)} style={btnStyle('#1a6fc4')}>✏️ Edit</button>
          <button onClick={() => generatePDF(r)} style={btnStyle('#198754')}>⬇ Download PDF</button>
          <button onClick={() => handleDelete(r.id)} style={btnStyle('#dc3545')}>🗑 Delete</button>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: 'var(--accent)', padding: '12px 18px', color: '#fff' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>SRI HAMSINI & CHANDRA ENTERPRISES</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>WATER PURIFICATION UNIT — SERVICE / VISIT REPORT</div>
          </div>

          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Report No</span><br /><b>{r.report_no || '-'}</b></div>
            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Visit Date</span><br /><b>{r.visit_date}</b></div>
            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>School / Site</span><br /><b>{r.school_name || r.school_name_manual || '-'}</b></div>
            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Unit Type</span><br />
              <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{r.unit_type}</span>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr><td colSpan={2} style={{ padding: '6px 10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12 }}>PROBLEM / ACTION</td></tr>
              {row('Problem Reported', r.problem_reported)}
              {row('Observation & Action', r.observation_action)}
              {row('Spares Required', r.spares_required)}
              <tr><td colSpan={2} style={{ padding: '6px 10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12 }}>UNIT DETAILS</td></tr>
              {row('Plant Location', r.plant_location)}
              {row('Plant Capacity', r.plant_capacity)}
              {row('Design R/W TDS', r.design_rw_tds)}
              {row('Free Chlorine in R/W', r.free_chlorine_rw)}
              {row('No. of Hours Running', r.hours_running)}
              {row('Membrane Condition', r.membrane_condition)}
              {row('UV Lamp Condition', r.uv_lamp_condition)}
              <tr><td colSpan={2} style={{ padding: '6px 10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12 }}>PLANT READINGS</td></tr>
              {row('Raw Water TDS', r.raw_water_tds)}
              {row('Product Water TDS', r.product_water_tds)}
              {row('Product Water Flow (LPH)', r.product_water_flow_lph)}
              {row('Sensors Condition', r.sensors_condition)}
              {row('Pre-Filter Condition', r.pre_filter_condition)}
              {row('Voltage', r.voltage)}
              {row('Current in Amps', r.current_amps)}
              <tr><td colSpan={2} style={{ padding: '6px 10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12 }}>SPARES & CUSTOMER</td></tr>
              {row('Spares Consumed', r.spares_consumed)}
              {row('Customer Name', r.customer_name)}
              {row('Customer Mobile', r.customer_mobile)}
              {row('Service Engineer', r.service_engineer_name)}
              {row('Customer Remarks', r.customer_remarks)}
              <tr>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--muted)', background: 'var(--surface2)', width: 180 }}>Status</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ background: r.problem_resolved === 'resolved' ? '#198754' : '#dc3545', color: '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                    {r.problem_resolved === 'resolved' ? '✓ Problem Resolved' : '✗ Problem Unresolved'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ---- Form ----
  if (showForm) {
    const section = (title) => (
      <div style={{ gridColumn: '1 / -1', borderTop: '2px solid var(--accent)', paddingTop: 10, marginTop: 4 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13, marginBottom: 8 }}>{title}</div>
      </div>
    )
    return (
      <div style={{ padding: '16px 20px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{editId ? 'Edit AMC Report' : 'New AMC Report'}</h2>
          <button onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY) }} style={btnStyle('#444')}>✕ Cancel</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>

            {section('REPORT INFO')}
            <Field label="Report No" name="report_no" value={form.report_no} onChange={handleChange} />
            <Field label="Visit Date *" name="visit_date" type="date" value={form.visit_date} onChange={handleChange} />
            <Field label="Complaint No" name="complaint_no" value={form.complaint_no} onChange={handleChange} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Unit Type</label>
              <select name="unit_type" value={form.unit_type} onChange={handleChange}
                style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
                {UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {section('SCHOOL / SITE')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>School (from list)</label>
              <SearchableSelect value={form.school_id} onChange={val => handleChange({ target: { name: 'school_id', value: val } })}
                placeholder="— Select School —"
                options={schools.map(s => ({ value: String(s.id), label: s.name }))} />
            </div>
            <Field label="Or Type School Name" name="school_name_manual" value={form.school_name_manual} onChange={handleChange} />

            {section('PROBLEM & ACTION')}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Problem Reported" name="problem_reported" value={form.problem_reported} onChange={handleChange} rows={2} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Observation & Action Taken" name="observation_action" value={form.observation_action} onChange={handleChange} rows={3} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Spares Required" name="spares_required" value={form.spares_required} onChange={handleChange} rows={2} />
            </div>

            {section('UNIT DETAILS / SITE CONDITION')}
            <Field label="Plant Location" name="plant_location" value={form.plant_location} onChange={handleChange} />
            <Field label="Plant Capacity" name="plant_capacity" value={form.plant_capacity} onChange={handleChange} />
            <Field label="Design R/W TDS" name="design_rw_tds" value={form.design_rw_tds} onChange={handleChange} />
            <Field label="Free Chlorine in R/W" name="free_chlorine_rw" value={form.free_chlorine_rw} onChange={handleChange} />
            <Field label="No. of Hours Running" name="hours_running" value={form.hours_running} onChange={handleChange} />
            <CondSelect label="Membrane Condition" name="membrane_condition" value={form.membrane_condition} onChange={handleChange} />
            <CondSelect label="UV Lamp Condition" name="uv_lamp_condition" value={form.uv_lamp_condition} onChange={handleChange} />

            {section('PLANT READINGS')}
            <Field label="Raw Water TDS" name="raw_water_tds" value={form.raw_water_tds} onChange={handleChange} />
            <Field label="Product Water TDS" name="product_water_tds" value={form.product_water_tds} onChange={handleChange} />
            <Field label="Product Water Flow (LPH)" name="product_water_flow_lph" value={form.product_water_flow_lph} onChange={handleChange} />
            <CondSelect label="Sensors Condition" name="sensors_condition" value={form.sensors_condition} onChange={handleChange} />
            <CondSelect label="Pre-Filter Condition" name="pre_filter_condition" value={form.pre_filter_condition} onChange={handleChange} />
            <Field label="Voltage" name="voltage" value={form.voltage} onChange={handleChange} />
            <Field label="Current in Amps" name="current_amps" value={form.current_amps} onChange={handleChange} />

            {section('SPARES CONSUMED')}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Spares Consumed" name="spares_consumed" value={form.spares_consumed} onChange={handleChange} rows={2} />
            </div>

            {section('CUSTOMER & ENGINEER')}
            <Field label="Customer Name" name="customer_name" value={form.customer_name} onChange={handleChange} />
            <Field label="Customer Mobile" name="customer_mobile" value={form.customer_mobile} onChange={handleChange} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Service Engineer</label>
              <SearchableSelect value={form.service_engineer_id} onChange={val => handleChange({ target: { name: 'service_engineer_id', value: val } })}
                placeholder="— Select Engineer —"
                options={employees.map(e => ({ value: String(e.id), label: `${e.name} (${e.employee_code})` }))} />
            </div>
            <Field label="Or Type Engineer Name" name="service_engineer_name" value={form.service_engineer_name} onChange={handleChange} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Problem Status</label>
              <select name="problem_resolved" value={form.problem_resolved} onChange={handleChange}
                style={{ padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
                <option value="resolved">Problem Resolved</option>
                <option value="unresolved">Problem Unresolved</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Customer Remarks" name="customer_remarks" value={form.customer_remarks} onChange={handleChange} rows={2} />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="submit" disabled={saving} style={{ ...btnStyle('#1a6fc4'), fontSize: 14, padding: '10px 28px' }}>
                {saving ? 'Saving...' : editId ? '💾 Update Report' : '➕ Create Report'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY) }} style={{ ...btnStyle('#555'), fontSize: 14, padding: '10px 20px' }}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    )
  }

  // ---- List view ----
  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>📋 AMC Reports</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Water Purifier Service Visit Reports</div>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true) }} style={{ ...btnStyle('#1a6fc4'), padding: '9px 18px', fontSize: 14 }}>
          + New Report
        </button>
      </div>

      <input
        placeholder="Search by school, report no, engineer..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '9px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={statCard('#1a6fc4')}><b>{reports.length}</b><span>Total Reports</span></div>
        <div style={statCard('#198754')}><b>{reports.filter(r => r.problem_resolved === 'resolved').length}</b><span>Resolved</span></div>
        <div style={statCard('#dc3545')}><b>{reports.filter(r => r.problem_resolved === 'unresolved').length}</b><span>Unresolved</span></div>
        <div style={statCard('#fd7e14')}><b>{reports.filter(r => r.unit_type === 'AMC').length}</b><span>AMC</span></div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
          No AMC reports yet. Click "+ New Report" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => (
            <div key={r.id} onClick={() => setViewReport(r)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.school_name || r.school_name_manual || 'Unknown School'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                    {r.visit_date} · Engineer: {r.service_engineer_name || '-'}
                    {r.report_no && ` · #${r.report_no}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>{r.unit_type}</span>
                  <span style={{ background: r.problem_resolved === 'resolved' ? '#198754' : '#dc3545', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                    {r.problem_resolved === 'resolved' ? '✓ Resolved' : '✗ Unresolved'}
                  </span>
                  <button onClick={e => { e.stopPropagation(); generatePDF(r) }}
                    style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>
                    ⬇ PDF
                  </button>
                </div>
              </div>
              {r.problem_reported && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.problem_reported}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function btnStyle(bg) {
  return { background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
}

function statCard(color) {
  return {
    background: 'var(--surface)', border: `1px solid ${color}30`, borderRadius: 8,
    padding: '8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    minWidth: 80, color: color, fontSize: 12, gap: 2,
  }
}
