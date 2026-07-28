import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'
import { todayIST } from '../utils/istTime'

const UNITS = [
  { value: '1', label: 'Unit 1 — Telangana' },
  { value: '2', label: 'Unit 2 — Andhra Pradesh' },
  { value: '3', label: 'Unit 3' },
]

const SEGMENTS = [
  { value: 'school',   label: '🏫 Schools'   },
  { value: 'hospital', label: '🏥 Hospitals' },
  { value: 'temple',   label: '🛕 Temples'   },
  { value: 'hostel',   label: '🏘️ Hostels'  },
  { value: 'park',     label: '🌳 Parks'     },
  { value: 'village',  label: '🏡 Villages'  },
  { value: 'other',    label: '📍 Other'     },
]

const CONTRACTS = [
  { value: 'AMC',        label: 'AMC'        },
  { value: 'Warranty',   label: 'Warranty'   },
  { value: 'Chargeable', label: 'Chargeable' },
]

const EMPTY = {
  unit: '', segment: '', mandal_id: '', unit_type: '', employee_id: '',
  date: '', date_from: '', date_to: '',
}

export default function ServiceReports() {
  const [reports, setReports] = useState([])
  const [meta, setMeta]       = useState({ label: '', showing_today_only: true, count: 0 })
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filters, setFilters] = useState(EMPTY)
  const [dateMode, setDateMode] = useState('range')   // 'single' | 'range'
  const [mandals, setMandals]   = useState([])
  const [techs, setTechs]       = useState([])
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 4000) }

  // Only send filters that are actually set — an empty object means "today".
  const activeParams = useCallback(() => {
    const p = {}
    if (filters.unit)        p.unit        = filters.unit
    if (filters.segment)     p.segment     = filters.segment
    if (filters.mandal_id)   p.mandal_id   = filters.mandal_id
    if (filters.unit_type)   p.unit_type   = filters.unit_type
    if (filters.employee_id) p.employee_id = filters.employee_id
    if (dateMode === 'single') {
      if (filters.date) p.date = filters.date
    } else {
      if (filters.date_from) p.date_from = filters.date_from
      if (filters.date_to)   p.date_to   = filters.date_to
    }
    return p
  }, [filters, dateMode])

  // Changing two filters quickly fires two requests; without this guard a slower
  // earlier response can land last and leave the list/label out of sync with the
  // filters actually selected. Only the newest request is allowed to write state.
  const reqSeq = useRef(0)

  const load = useCallback(() => {
    const seq = ++reqSeq.current
    setLoading(true)
    api.get('/api/service-reports/', { params: activeParams() })
      .then(r => {
        if (seq !== reqSeq.current) return      // superseded — discard
        // Endpoint returns { items, count, label, showing_today_only }
        const d = r.data
        setReports(Array.isArray(d) ? d : (d.items || []))
        setMeta({
          label: d.label || '',
          showing_today_only: !!d.showing_today_only,
          count: d.count ?? (Array.isArray(d) ? d.length : 0),
        })
        setLoading(false)
      })
      .catch(() => { if (seq === reqSeq.current) setLoading(false) })
  }, [activeParams])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/api/mandals/').then(r => setMandals(r.data || [])).catch(() => {})
    api.get('/api/employees/').then(r =>
      setTechs((r.data || []).filter(e => e.role === 'technician'))).catch(() => {})
  }, [])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const anyFilter = Object.values(filters).some(Boolean)

  async function downloadAll() {
    setDownloading(true)
    try {
      const res = await api.get('/api/service-reports/download-all', {
        params: activeParams(), responseType: 'blob', timeout: 300000,
      })
      // Filename comes from the server so the folder matches the conditions.
      const cd = res.headers['content-disposition'] || ''
      const m = /filename="?([^"]+)"?/.exec(cd)
      const name = m ? m[1] : 'Service Reports.zip'
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      showToast(`📦 Downloaded "${name.replace(/\.zip$/, '')}" — unzip to get the folder`)
    } catch (err) {
      // A blob error body has to be read back as text before we can see the detail
      let detail = 'Download failed'
      try {
        if (err.response?.data instanceof Blob) {
          const txt = await err.response.data.text()
          detail = JSON.parse(txt).detail || detail
        } else {
          detail = err.response?.data?.detail || detail
        }
      } catch {}
      showToast('❌ ' + detail)
    }
    setDownloading(false)
  }

  const filtered = reports.filter(r =>
    !search ||
    r.school_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.report_date?.includes(search)
  )

  const ctl = { minWidth: 150 }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📄 Service Reports</h3>
        <button className="btn btn-primary" onClick={downloadAll} disabled={downloading || meta.count === 0}>
          {downloading ? '⏳ Preparing…' : `📦 Download All${meta.count ? ` (${meta.count})` : ''}`}
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Unit</div>
            <SearchableSelect value={filters.unit} onChange={v => set('unit', v)}
              placeholder="All Units" options={UNITS} style={ctl} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Site Type</div>
            <SearchableSelect value={filters.segment} onChange={v => set('segment', v)}
              placeholder="All Site Types" options={SEGMENTS} style={ctl} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Mandal</div>
            <SearchableSelect value={filters.mandal_id} onChange={v => set('mandal_id', v)}
              placeholder="All Mandals"
              options={mandals.map(m => ({ value: String(m.id), label: m.name }))} style={ctl} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Contract</div>
            <SearchableSelect value={filters.unit_type} onChange={v => set('unit_type', v)}
              placeholder="All Contracts" options={CONTRACTS} style={ctl} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Technician</div>
            <SearchableSelect value={filters.employee_id} onChange={v => set('employee_id', v)}
              placeholder="All Technicians"
              options={techs.map(t => ({ value: String(t.id), label: `${t.name} [${t.employee_code}]` }))} style={ctl} />
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Date</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['range', 'single'].map(m => (
                <button key={m} onClick={() => setDateMode(m)} style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: dateMode === m ? 'var(--accent-soft)' : 'var(--surface2)',
                  border: `1.5px solid ${dateMode === m ? 'var(--accent)' : 'var(--border)'}`,
                  color: dateMode === m ? 'var(--accent)' : 'var(--muted)',
                }}>{m === 'range' ? 'From – To' : 'Single day'}</button>
              ))}
            </div>
          </div>
          {dateMode === 'single' ? (
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 4 }}>On date</div>
              <input type="date" value={filters.date} max={todayIST()} onChange={e => set('date', e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 4 }}>From</div>
                <input type="date" value={filters.date_from} max={todayIST()} onChange={e => set('date_from', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 4 }}>To</div>
                <input type="date" value={filters.date_to} max={todayIST()} onChange={e => set('date_to', e.target.value)} />
              </div>
            </>
          )}
          {anyFilter && (
            <button className="btn btn-outline btn-sm" onClick={() => { setFilters(EMPTY); setSearch('') }}>
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* What's being shown */}
        <div style={{ marginTop: 12, fontSize: 12 }}>
          {meta.showing_today_only ? (
            <span style={{ color: 'var(--muted)' }}>
              Showing <b style={{ color: 'var(--accent)' }}>today's reports</b> ({meta.count}) — no filters selected. Pick filters above to see more.
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>
              Showing <b style={{ color: 'var(--accent)' }}>{meta.count}</b> report{meta.count === 1 ? '' : 's'} · {meta.label}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid-3" style={{ gap: 10, marginBottom: 14 }}>
        {[
          ['📄 Reports Shown',   reports.length,                          'var(--accent)'],
          ['✅ PDF Ready',       reports.filter(r => r.pdf_url).length,   'var(--green)'],
          ['⏳ Pending PDF',     reports.filter(r => !r.pdf_url).length,  'var(--yellow)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search within the current results */}
      <input
        type="text"
        placeholder="Search within these results — site, technician or date…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
      />

      {loading ? <div className="spinner" /> : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          {meta.showing_today_only
            ? 'No service reports submitted today. Use the filters above to look at other dates.'
            : 'No service reports match these filters.'}
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
                  {r.unit_type && <> · 📋 {r.unit_type}</>}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
