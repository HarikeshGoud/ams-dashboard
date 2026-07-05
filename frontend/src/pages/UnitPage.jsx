import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const UNIT_META = {
  '1': { label: 'Unit 1', state: 'Telangana',       color: '#2563eb', bg: 'rgba(37,99,235,0.08)'  },
  '2': { label: 'Unit 2', state: 'Andhra Pradesh',  color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  '3': { label: 'Unit 3', state: 'Other States',    color: '#0891b2', bg: 'rgba(8,145,178,0.08)'  },
}

const SEGMENTS = [
  { key: 'all',      label: 'All Sites',  icon: '🏠' },
  { key: 'school',   label: 'Schools',    icon: '🏫' },
  { key: 'hospital', label: 'Hospitals',  icon: '🏥' },
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
  return '#fd7e14'
}
function condLabel(c) {
  if (!c)                return 'Not Visited'
  if (c === 'working')   return 'Working'
  if (c === 'not_working') return 'Not Working'
  if (c === 'under_repair' || c === 'repair') return 'Under Repair'
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

// ── Site visits modal ──────────────────────────────────────────────────────
function SiteModal({ site, onClose }) {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/visits/?limit=500').then(r => {
      const all = r.data?.items || r.data || []
      setVisits(all.filter(v => v.school_id === site.id).slice(0, 15))
      setLoading(false)
    })
  }, [site.id])

  function downloadPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210
    doc.setFillColor(13, 110, 253)
    doc.rect(0, 0, W, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('SRI HAMSINI & CHANDRA ENTERPRISES', W / 2, 9, { align: 'center' })
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('SITE VISIT HISTORY REPORT', W / 2, 16, { align: 'center' })
    doc.setTextColor(0)
    doc.setFontSize(10)
    doc.text(`Site: ${site.name}`, 12, 30)
    doc.text(`Mandal: ${site.mandal_name || '-'}   Contract: ${(site.amc_status || '').toUpperCase()}   Segment: ${site.model || '-'}`, 12, 37)

    autoTable(doc, {
      startY: 43,
      head: [['Visit Date', 'Technician', 'Plant Condition', 'MCF Used', 'Antiscalant (L)', 'Remarks']],
      body: visits.map(v => [
        v.visit_date || '-',
        v.employee_name || '-',
        condLabel(v.plant_condition),
        v.mcf_used ?? 0,
        v.antiscalant_used ?? 0,
        v.remarks || '-',
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [13, 110, 253], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 255] },
      margin: { left: 12, right: 12 },
    })
    doc.save(`${site.name.replace(/[^a-z0-9]/gi, '_')}_visits.pdf`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 740, maxHeight: '90vh', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{site.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {site.mandal_name || 'No mandal'} · {contractLabel(site.amc_status)} · {site.model || 'site'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={downloadPDF} style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              ⬇ PDF Report
            </button>
            <button onClick={onClose} style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
              ✕
            </button>
          </div>
        </div>

        {/* Site details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          {[
            ['Technician', site.technician_name || '—'],
            ['Plant Condition', condLabel(site.plant_condition)],
            ['Last Visit', site.last_visit_date || '—'],
            ['Contract', contractLabel(site.amc_status)],
            ['Capacity', site.capacity || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Visit history */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--accent)' }}>Recent Visits</div>
          {loading ? (
            <div style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>Loading...</div>
          ) : visits.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>No visits recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    {['Date', 'Technician', 'Condition', 'MCF', 'Anti (L)', 'Remarks'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v, i) => (
                    <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{v.visit_date}</td>
                      <td style={{ padding: '8px 12px' }}>{v.employee_name || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: condColor(v.plant_condition), color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>{condLabel(v.plant_condition)}</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{v.mcf_used ?? 0}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{v.antiscalant_used ?? 0}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>{v.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    ['Working',       sites.filter(s => s.plant_condition === 'working').length,             '#198754' ],
    ['Not Working',   sites.filter(s => s.plant_condition === 'not_working').length,         '#dc3545' ],
    ['Not Visited',   sites.filter(s => !s.plant_condition).length,                          '#6c757d' ],
    ['AMC',           sites.filter(s => s.amc_status === 'amc').length,                     '#fd7e14' ],
    ['Warranty',      sites.filter(s => s.amc_status === 'warranty').length,                '#7c3aed' ],
    ['Chargeable',    sites.filter(s => s.amc_status === 'chargeable').length,              '#0891b2' ],
  ]

  return (
    <div style={{ padding: '16px 20px' }}>
      {selectedSite && <SiteModal site={selectedSite} onClose={() => setSelectedSite(null)} />}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: meta.bg, border: `1px solid ${meta.color}30`, borderLeft: `4px solid ${meta.color}`, borderRadius: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: meta.color }}>{meta.label} — {meta.state}</h2>
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
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }} onClick={() => setSelectedSite(s)}>{s.last_visit_date || '—'}</td>
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
