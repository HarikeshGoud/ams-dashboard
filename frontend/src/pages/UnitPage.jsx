import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { isOverdue } from '../utils/visitStatus'

const UNIT_META = {
  '1': { label: 'Unit 1', state: 'Telangana',       color: '#2563eb', bg: 'rgba(37,99,235,0.08)'  },
  '2': { label: 'Unit 2', state: 'Andhra Pradesh',  color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  '3': { label: 'Unit 3', state: '',                color: '#0891b2', bg: 'rgba(8,145,178,0.08)'  },
}

const SEGMENTS = [
  { key: 'all',      label: 'All Sites',  icon: '🏠' },
  { key: 'school',   label: 'Schools',    icon: '🏫' },
  { key: 'hospital', label: 'Hospitals',  icon: '🏥' },
  { key: 'hostel',   label: 'Hostels',    icon: '🏘️' },
  { key: 'temple',   label: 'Temples',    icon: '🛕' },
  { key: 'park',     label: 'Parks',      icon: '🌳' },
  { key: 'village',  label: 'Villages',   icon: '🏡' },
  { key: 'other',    label: 'Other',      icon: '📍' },
]

const CONTRACT_OPTS = [
  { key: 'all',        label: 'All Contracts' },
  { key: 'amc',        label: '🔧 AMC'        },
  { key: 'warranty',   label: '🛡 Warranty'   },
  { key: 'chargeable', label: '💳 Chargeable' },
]

function condColor(c) {
  if (!c)                  return '#6c757d'
  if (c === 'working')     return '#198754'
  if (c === 'not_working') return '#dc3545'
  return '#6c757d'
}
function condLabel(c) {
  if (!c)                  return 'Not Visited'
  if (c === 'working')     return 'Resolved'
  if (c === 'not_working') return 'Unresolved'
  return c
}
function contractColor(s) {
  return s === 'amc' ? '#fd7e14' : s === 'warranty' ? '#7c3aed' : '#6c757d'
}
function contractLabel(s) {
  if (s === 'amc') return '🔧 AMC'
  if (s === 'warranty') return '🛡 Warranty'
  if (s === 'chargeable') return '💳 Chargeable'
  return s || '—'
}

// ── Inline contract editor ─────────────────────────────────────────────────
function ContractEditor({ site, onSaved }) {
  const [val, setVal] = useState(site.amc_status || 'amc')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`/api/schools/${site.id}`, {
        name: site.name,
        client_id: site.client_id || null,
        model: site.model || 'school',
        mandal: site.mandal_name || null,
        capacity: site.capacity || null,
        plant_model: site.plant_model || null,
        unit_number: site.unit_number || null,
        amc_status: val,
      })
      onSaved(site.id, val)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        value={val}
        onChange={e => setVal(e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{ padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }}
      >
        <option value="amc">AMC</option>
        <option value="warranty">Warranty</option>
        <option value="chargeable">Chargeable</option>
        <option value="others">Others</option>
      </select>
      {val !== (site.amc_status || 'amc') && (
        <button
          onClick={e => { e.stopPropagation(); save() }}
          disabled={saving}
          style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function reportTypeMeta(type) {
  if (type === 'visit')          return { label: 'Visit',          color: '#2563eb', icon: '📋' }
  if (type === 'field_report')   return { label: 'Field Report',   color: '#198754', icon: '🔧' }
  if (type === 'service_report') return { label: 'Service Report', color: '#fd7e14', icon: '🛠' }
  return { label: type, color: '#6c757d', icon: '📄' }
}

function groupByYearMonth(reports) {
  const map = {}
  reports.forEach(r => {
    if (!r.date) return
    const [yr, mo] = r.date.split('-')
    const key = `${yr}-${mo}`
    if (!map[key]) map[key] = { year: yr, month: mo, items: [] }
    map[key].items.push(r)
  })
  return Object.values(map).sort((a, b) => `${b.year}-${b.month}`.localeCompare(`${a.year}-${a.month}`))
}

// ── Site Reports Modal ─────────────────────────────────────────────────────
function SiteModal({ site, onClose }) {
  const [reports, setReports]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeYear, setYear]   = useState('all')
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    setLoading(true)
    api.get(`/api/schools/${site.id}/reports`).then(r => {
      setReports(r.data?.reports || [])
    }).catch(() => setReports([])).finally(() => setLoading(false))
  }, [site.id])

  // derive years present in data
  const years = [...new Set(reports.map(r => r.date?.split('-')[0]).filter(Boolean))].sort((a,b) => b-a)
  const now = new Date()
  const thisYearStr  = String(now.getFullYear())
  const thisMonthStr = String(now.getMonth() + 1).padStart(2, '0')

  const filtered = activeYear === 'all'   ? reports
    : activeYear === 'month' ? reports.filter(r => r.date?.startsWith(`${thisYearStr}-${thisMonthStr}`))
    : reports.filter(r => r.date?.startsWith(activeYear))

  const grouped = groupByYearMonth(filtered)

  const thisMonthCount = reports.filter(r => r.date?.startsWith(`${thisYearStr}-${thisMonthStr}`)).length

  function toggleSelect(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function buildPDF(list, label) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210
    doc.setFillColor(13, 110, 253); doc.rect(0, 0, W, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('SRI HAMSINI & CHANDRA ENTERPRISES', W / 2, 10, { align: 'center' })
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('SITE REPORT HISTORY', W / 2, 18, { align: 'center' })
    doc.setTextColor(0); doc.setFontSize(10)
    doc.text(`Site: ${site.name}`, 12, 33)
    doc.text(`Mandal: ${site.mandal_name || '-'}  |  Contract: ${(site.amc_status || '').toUpperCase()}  |  Reports: ${list.length}`, 12, 40)
    const rows = list.map(r => {
      const m = reportTypeMeta(r.type)
      if (r.type === 'visit')
        return [r.date || '-', m.label, r.technician || '-', condLabel(r.plant_condition), `MCF:${r.mcf_used ?? 0}`, r.remarks || '-']
      if (r.type === 'field_report')
        return [r.date || '-', m.label, r.technician || '-', r.site_condition || '-', r.item_installed || '-', r.remarks || '-']
      return [r.date || '-', m.label, r.technician || '-', r.action_taken || '-', `TDS ${r.tds_input ?? '-'}->${r.tds_output ?? '-'}`, r.status || '-']
    })
    autoTable(doc, {
      startY: 46,
      head: [['Date', 'Type', 'Technician', 'Condition/Action', 'Details', 'Remarks']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [13, 110, 253], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 255] },
      margin: { left: 10, right: 10 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 24 }, 5: { cellWidth: 38 } },
    })
    doc.save(`${site.name.replace(/[^a-z0-9]/gi, '_')}_${label}.pdf`)
  }

  function downloadAll() {
    const period = activeYear === 'month' ? `${MONTH_NAMES[now.getMonth()]}_${thisYearStr}` : (activeYear === 'all' ? 'all' : activeYear)
    buildPDF(filtered, `reports_${period}`)
  }

  function downloadSelected() {
    const list = filtered.filter(r => selected.has(`${r.type}-${r.id}`))
    buildPDF(list, `selected_${list.length}`)
    setSelected(new Set())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{site.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {site.mandal_name || 'No mandal'} · {contractLabel(site.amc_status)} · {site.model || 'site'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selected.size > 0 && (
              <button onClick={downloadSelected} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                ⬇ Download Selected ({selected.size})
              </button>
            )}
            {filtered.length > 0 && selected.size === 0 && (
              <button onClick={downloadAll} style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                ⬇ Download All
              </button>
            )}
            <button onClick={onClose} style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            ['Total Reports', reports.length, '#2563eb'],
            ['This Month',    thisMonthCount,  '#198754'],
            ['Last Report',   reports[0]?.date || '—', '#fd7e14'],
            ['Technician',    site.technician_name || '—', '#7c3aed'],
            ['Capacity',      site.capacity || '—', '#6c757d'],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em' }}>{lbl.toUpperCase()}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: col, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Year / period tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
          {[
            { key: 'month', label: `This Month (${MONTH_NAMES[now.getMonth()]} ${thisYearStr})` },
            { key: 'all',   label: 'All Records' },
            ...years.map(y => ({ key: y, label: y })),
          ].map(tab => (
            <button key={tab.key} onClick={() => setYear(tab.key)} style={{
              padding: '10px 20px', border: 'none', borderBottom: activeYear === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent', color: activeYear === tab.key ? 'var(--accent)' : 'var(--muted)',
              fontWeight: activeYear === tab.key ? 700 : 400, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {tab.label}
              {tab.key !== 'all' && tab.key !== 'month' && (
                <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--surface2)', borderRadius: 10, padding: '1px 6px' }}>
                  {reports.filter(r => r.date?.startsWith(tab.key)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Report list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading ? (
            <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading reports...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>No reports for this period.</div>
          ) : (
            grouped.map(({ year, month, items }) => (
              <div key={`${year}-${month}`} style={{ marginBottom: 24 }}>
                {/* Month heading */}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{MONTH_NAMES[parseInt(month,10)-1].toUpperCase()} {year}</span>
                  <span style={{ background: 'var(--surface2)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 500 }}>{items.length} report{items.length > 1 ? 's' : ''}</span>
                </div>

                {items.map(r => {
                  const meta = reportTypeMeta(r.type)
                  const rKey = `${r.type}-${r.id}`
                  const isChecked = selected.has(rKey)
                  return (
                    <div key={rKey} style={{ background: isChecked ? `${meta.color}12` : 'var(--surface2)', border: `1px solid ${isChecked ? meta.color : meta.color+'30'}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 8, padding: '12px 16px', marginBottom: 10, transition: 'background .15s' }}>
                      {/* Report header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(rKey)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: meta.color, flexShrink: 0 }}
                          />
                          <span style={{ background: `${meta.color}22`, color: meta.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{meta.icon} {meta.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{r.date}</span>
                          {r.technician && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {r.technician}</span>}
                        </div>
                        {r.verification_status && (
                          <span style={{ fontSize: 11, color: r.verification_status === 'verified' ? '#198754' : '#fd7e14', fontWeight: 600 }}>
                            {r.verification_status === 'verified' ? '✓ Verified' : '⏳ Pending'}
                          </span>
                        )}
                      </div>

                      {/* Report body — varies by type */}
                      {r.type === 'visit' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, fontSize: 12 }}>
                          <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Condition</span><br /><span style={{ fontWeight: 600 }}>{condLabel(r.plant_condition)}</span></div>
                          <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>TDS</span><br /><span style={{ fontWeight: 600 }}>{r.tds_reading ?? '—'}</span></div>
                          <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>pH</span><br /><span style={{ fontWeight: 600 }}>{r.ph_reading ?? '—'}</span></div>
                          <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>MCF Used</span><br /><span style={{ fontWeight: 600 }}>{r.mcf_used ?? 0}</span></div>
                          <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Antiscalant (L)</span><br /><span style={{ fontWeight: 600 }}>{r.antiscalant_used ?? 0}</span></div>
                          {r.spares_used && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Spares Used</span><br />{r.spares_used}</div>}
                          {r.work_done   && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Work Done</span><br />{r.work_done}</div>}
                          {r.remarks     && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Remarks</span><br />{r.remarks}</div>}
                        </div>
                      )}

                      {r.type === 'field_report' && (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: r.item_installed || r.remarks ? 8 : 0 }}>
                            {r.site_condition && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Site Condition</span><br /><span style={{ fontWeight: 600 }}>{r.site_condition}</span></div>}
                            {(r.machines_working != null) && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Machines</span><br /><span style={{ fontWeight: 600 }}>{r.machines_working}/{r.machines_total} working</span></div>}
                            {r.filters_replaced && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Filters Replaced</span><br /><span style={{ fontWeight: 600 }}>{r.filters_replaced}</span></div>}
                          </div>
                          {r.item_installed && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Items Installed: </span>{r.item_installed}</div>}
                          {r.remarks       && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Remarks: </span>{r.remarks}</div>}
                          {r.photos?.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {r.photos.map((p, i) => (
                                <a key={i} href={p.url} target="_blank" rel="noreferrer">
                                  <img src={p.url} alt={p.type} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {r.type === 'service_report' && (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
                            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>TDS In → Out</span><br /><span style={{ fontWeight: 600 }}>{r.tds_input ?? '—'} → {r.tds_output ?? '—'}</span></div>
                            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Voltage</span><br /><span style={{ fontWeight: 600 }}>{r.voltage ?? '—'} V</span></div>
                            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Flow Rate</span><br /><span style={{ fontWeight: 600 }}>{r.flow_rate ?? '—'}</span></div>
                            <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Status</span><br /><span style={{ fontWeight: 600, color: '#198754' }}>{r.status}</span></div>
                          </div>
                          {r.problem_description && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Problem: </span>{r.problem_description}</div>}
                          {r.observation        && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Observation: </span>{r.observation}</div>}
                          {r.action_taken       && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--muted)', fontSize: 11 }}>Action Taken: </span>{r.action_taken}</div>}
                          {r.spare_parts        && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Spare Parts: </span>{r.spare_parts}</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main UnitPage ──────────────────────────────────────────────────────────
export default function UnitPage() {
  const { unit } = useParams()
  const meta = UNIT_META[unit] || UNIT_META['1']

  const [segment, setSegment] = useState('all')
  const [contract, setContract] = useState('all')
  const [search, setSearch] = useState('')
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSite, setSelectedSite] = useState(null)

  // Reset contract tab when segment changes
  function selectSegment(seg) {
    setSegment(seg)
    setContract('all')
    setSearch('')
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 2000, unit_number: unit })
      if (segment !== 'all') params.append('segment', segment)
      if (contract !== 'all') params.append('contract_type', contract)
      const r = await api.get(`/api/schools/?${params}`)
      setSites(r.data?.items || [])
    } finally { setLoading(false) }
  }, [unit, segment, contract])

  useEffect(() => { load() }, [load])

  // Update contract in local state without full reload
  function onContractSaved(siteId, newVal) {
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, amc_status: newVal } : s))
  }

  const filtered = sites.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.mandal_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const statCards = [
    ['Total Sites',   sites.length,                                                          meta.color],
    ['Resolved',      sites.filter(s => s.plant_condition === 'working').length,             '#198754' ],
    ['Unresolved',    sites.filter(s => s.plant_condition === 'not_working').length,         '#dc3545' ],
    ['Not Visited',   sites.filter(s => !s.plant_condition).length,                          '#6c757d' ],
    ['AMC',           sites.filter(s => s.amc_status === 'amc').length,                     '#fd7e14' ],
    ['Warranty',      sites.filter(s => s.amc_status === 'warranty').length,                '#7c3aed' ],
    ['Chargeable',    sites.filter(s => s.amc_status === 'chargeable').length,              '#0891b2' ],
    ['Overdue (3mo+)', sites.filter(s => isOverdue(s.last_visit_date)).length,               '#dc3545' ],
  ]

  return (
    <div style={{ padding: '16px 20px' }}>
      {selectedSite && <SiteModal site={selectedSite} onClose={() => setSelectedSite(null)} />}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: meta.bg, border: `1px solid ${meta.color}30`, borderLeft: `4px solid ${meta.color}`, borderRadius: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: meta.color }}>{meta.label}{meta.state ? ` — ${meta.state}` : ''}</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Water purifier sites · select a segment and contract type below</div>
        </div>
      </div>

      {/* Segment pills */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>SEGMENT</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEGMENTS.map(seg => (
            <button key={seg.key} onClick={() => selectSegment(seg.key)} style={{
              padding: '7px 16px', border: `1.5px solid ${segment === seg.key ? meta.color : 'var(--border)'}`,
              borderRadius: 20, cursor: 'pointer', fontWeight: segment === seg.key ? 700 : 400, fontSize: 13,
              background: segment === seg.key ? meta.color : 'var(--surface)',
              color: segment === seg.key ? '#fff' : 'var(--muted)',
              transition: 'all .15s',
            }}>
              {seg.icon} {seg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contract tabs — only shown when a specific segment is selected */}
      {segment !== 'all' && (
        <div style={{ marginTop: 12, marginBottom: 18, paddingLeft: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>
            CONTRACT TYPE — {SEGMENTS.find(s => s.key === segment)?.label.toUpperCase()}
          </div>
          <div style={{ display: 'flex', gap: 0, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
            {CONTRACT_OPTS.map(ct => (
              <button key={ct.key} onClick={() => setContract(ct.key)} style={{
                padding: '9px 24px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: contract === ct.key ? 'rgba(59,158,255,0.15)' : 'transparent',
                color: contract === ct.key ? 'var(--accent)' : 'var(--muted)',
                borderBottom: contract === ct.key ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all .15s',
              }}>
                {ct.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {segment === 'all' && <div style={{ marginBottom: 18 }} />}

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {statCards.map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '10px 18px', minWidth: 90 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        placeholder="Search by site name or mandal..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: 380, padding: '9px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
      />

      {/* Sites table */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading sites...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
          No sites found. Go to <b>Schools / Sites</b> page → Edit a site → set its Unit to <b>{meta.label}</b>.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['#', 'Site Name', 'Mandal', 'Segment', 'Contract Type', 'Technician', 'Condition', 'Last Visit', 'View'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}
                  style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)', transition: 'background .12s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,158,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}
                >
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }} onClick={() => setSelectedSite(s)}>{s.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }} onClick={() => setSelectedSite(s)}>{s.mandal_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }} onClick={() => setSelectedSite(s)}>
                    <span style={{ background: `${meta.color}18`, color: meta.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{s.model || '—'}</span>
                  </td>

                  {/* Inline contract editor */}
                  <td style={{ padding: '8px 12px' }}>
                    <ContractEditor site={s} onSaved={onContractSaved} />
                  </td>

                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }} onClick={() => setSelectedSite(s)}>{s.technician_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }} onClick={() => setSelectedSite(s)}>
                    <span style={{ background: condColor(s.plant_condition), color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>{condLabel(s.plant_condition)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }} onClick={() => setSelectedSite(s)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{s.last_visit_date || 'Never'}</span>
                      {isOverdue(s.last_visit_date) && (
                        <span style={{ background: '#dc3545', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ⚠ Overdue
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => setSelectedSite(s)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
