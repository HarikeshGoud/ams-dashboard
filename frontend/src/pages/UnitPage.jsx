import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const UNIT_META = {
  '1': { label: 'Unit 1', state: 'Telangana', color: '#2563eb', flag: '🔵' },
  '2': { label: 'Unit 2', state: 'Andhra Pradesh', color: '#7c3aed', flag: '🟣' },
  '3': { label: 'Unit 3', state: 'Other States', color: '#0891b2', flag: '🔷' },
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

const CONTRACT_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'amc',      label: 'AMC' },
  { key: 'warranty', label: 'Warranty' },
]

function condColor(c) {
  if (c === 'working') return '#198754'
  if (c === 'not_working') return '#dc3545'
  return '#fd7e14'
}
function condLabel(c) {
  if (c === 'working') return 'Working'
  if (c === 'not_working') return 'Not Working'
  return 'Under Repair'
}

// ── Site visits modal ──────────────────────────────────────────────────────
function SiteModal({ site, onClose }) {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/visits/?limit=20`).then(r => {
      const all = r.data?.items || r.data || []
      setVisits(all.filter(v => v.school_id === site.id).slice(0, 10))
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
    doc.text(`Mandal: ${site.mandal_name || '-'}  |  Contract: ${(site.amc_status || '').toUpperCase()}  |  Segment: ${site.model || '-'}`, 12, 37)

    autoTable(doc, {
      startY: 43,
      head: [['Visit Date', 'Technician', 'Plant Condition', 'MCF Used', 'Antiscalant (L)', 'Spares', 'Remarks']],
      body: visits.map(v => [
        v.visit_date || '-',
        v.employee_name || '-',
        condLabel(v.plant_condition),
        v.mcf_used ?? 0,
        v.antiscalant_used ?? 0,
        v.spares_used || '-',
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{site.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {site.mandal_name || 'No mandal'} · {(site.amc_status || '').toUpperCase()} · {site.model || 'site'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={downloadPDF} style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              ⬇ PDF
            </button>
            <button onClick={onClose} style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Site info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          {[
            ['Technician', site.technician_name || '—'],
            ['Plant Condition', condLabel(site.plant_condition)],
            ['Last Visit', site.last_visit_date || '—'],
            ['Contract', (site.amc_status || '—').toUpperCase()],
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
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--accent)' }}>Recent Visit History</div>
          {loading ? <div style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>Loading...</div> :
            visits.length === 0 ? <div style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>No visits recorded for this site.</div> : (
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
            )
          }
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 200, unit_number: unit })
      if (segment !== 'all') params.append('segment', segment)
      if (contract !== 'all') params.append('contract_type', contract)
      const r = await api.get(`/api/schools/?${params}`)
      setSites(r.data?.items || [])
    } finally { setLoading(false) }
  }, [unit, segment, contract])

  useEffect(() => { load() }, [load])

  const filtered = sites.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.mandal_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const working = filtered.filter(s => s.plant_condition === 'working').length
  const notWorking = filtered.filter(s => s.plant_condition === 'not_working').length
  const amcCount = filtered.filter(s => s.amc_status === 'amc').length
  const warrantyCount = filtered.filter(s => s.amc_status === 'warranty').length

  return (
    <div style={{ padding: '16px 20px' }}>
      {selectedSite && <SiteModal site={selectedSite} onClose={() => setSelectedSite(null)} />}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 32, background: meta.color, borderRadius: 3 }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{meta.flag} {meta.label} — {meta.state}</h2>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Water purifier sites across {meta.state}</div>
          </div>
        </div>
      </div>

      {/* Segment tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SEGMENTS.map(seg => (
          <button key={seg.key} onClick={() => setSegment(seg.key)} style={{
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

      {/* Contract tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
        {CONTRACT_TABS.map(ct => (
          <button key={ct.key} onClick={() => setContract(ct.key)} style={{
            padding: '8px 22px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            background: contract === ct.key ? 'rgba(59,158,255,0.15)' : 'transparent',
            color: contract === ct.key ? 'var(--accent)' : 'var(--muted)',
            borderBottom: contract === ct.key ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all .15s',
          }}>
            {ct.key === 'amc' ? '🔧 AMC' : ct.key === 'warranty' ? '🛡 Warranty' : 'All Contracts'}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          ['Total Sites', filtered.length, meta.color],
          ['Working', working, '#198754'],
          ['Not Working', notWorking, '#dc3545'],
          ['AMC', amcCount, '#fd7e14'],
          ['Warranty', warrantyCount, '#7c3aed'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '10px 18px', minWidth: 90 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        placeholder="Search site name or mandal..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: 380, padding: '9px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
      />

      {/* Sites table */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading sites...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
          No sites found for this filter. Assign sites to {meta.label} from the <b>Schools / Sites</b> page.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['#', 'Site Name', 'Mandal', 'Segment', 'Contract', 'Technician', 'Plant Condition', 'Last Visit', 'Report'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}
                  style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' }}
                  onClick={() => setSelectedSite(s)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,158,255,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}
                >
                  <td style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{s.mandal_name || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: 'rgba(59,158,255,0.12)', color: 'var(--accent)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{s.model || 'site'}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      background: s.amc_status === 'amc' ? 'rgba(253,126,20,0.15)' : 'rgba(124,58,237,0.15)',
                      color: s.amc_status === 'amc' ? '#fd7e14' : '#7c3aed',
                      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700
                    }}>
                      {s.amc_status === 'amc' ? '🔧 AMC' : s.amc_status === 'warranty' ? '🛡 Warranty' : s.amc_status || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{s.technician_name || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ background: condColor(s.plant_condition), color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>{condLabel(s.plant_condition)}</span>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 12 }}>{s.last_visit_date || '—'}</td>
                  <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
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
