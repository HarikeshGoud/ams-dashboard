import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'
import { exportExcel, exportPDF } from '../utils/exportReports'

// Consumables & spares consumption summary — the sheet that gets sent to a client.
//
// The figures are FETCHED, not fixed: quantities come from what technicians recorded on their
// proofs, rates from the client's agreed price list, and both are editable here before the
// document is produced. That is deliberate — the person sending the bill decides what it says,
// and a rate that was never agreed shows as blank rather than silently billing at cost.
//
// Sections follow the printed sheet, and come from the stock categories that already exist:
// the big-plant items, then the small-plant items, then anything else.
const SECTIONS = [
  { key: '1000/1500/2000 LPH RO Units', label: 'A) 1000 LPH RO plants consumption' },
  { key: '50/100 LPH RO Units',          label: 'B) 50 / 100 LPH RO plants consumption' },
]

const SEGMENTS = [
  { value: '', label: 'All site types' },
  { value: 'temple', label: 'Temples' }, { value: 'school', label: 'Schools' },
  { value: 'hospital', label: 'Hospitals' }, { value: 'hostel', label: 'Hostels' },
  { value: 'village', label: 'Villages' }, { value: 'park', label: 'Parks' },
  { value: 'other', label: 'Other' },
]

const CONTRACTS = [
  { value: '', label: 'All contracts' }, { value: 'amc', label: 'AMC' },
  { value: 'warranty', label: 'Warranty' }, { value: 'chargeable', label: 'Chargeable' },
  { value: 'others', label: 'Others' },
]

const money = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function ConsumptionReport() {
  const [clients, setClients] = useState([])
  const [sites, setSites] = useState([])
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [clientId, setClientId] = useState('')
  const [segment, setSegment] = useState('')
  const [contract, setContract] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [gst, setGst] = useState('18')
  const [data, setData] = useState(null)
  // item_id -> { qty, rate } while the operator is adjusting. Kept apart from `data` so
  // re-running the report doesn't wipe an edit, and so Reset can put the originals back.
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    Promise.all([
      api.get('/api/clients/').catch(() => ({ data: [] })),
      api.get('/api/schools/', { params: { limit: 3000 } }).catch(() => ({ data: { items: [] } })),
    ]).then(([c, s]) => {
      setClients(c.data?.items || c.data || [])
      setSites(s.data?.items || s.data || [])
    })
  }, [])

  async function run() {
    setLoading(true); setError(''); setEdits({})
    try {
      const r = await api.get('/api/consumption/summary', {
        params: {
          date_from: dateFrom, date_to: dateTo,
          ...(clientId ? { client_id: Number(clientId) } : {}),
          ...(segment ? { segment } : {}),
          ...(contract ? { contract_type: contract } : {}),
          ...(schoolId ? { school_id: Number(schoolId) } : {}),
          gst_percent: Number(gst) || 0,
        },
      })
      setData(r.data)
      if (r.data?.gst_percent != null) setGst(String(r.data.gst_percent))
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not build the summary.')
      setData(null)
    }
    setLoading(false)
  }

  const val = (line, field) => {
    const e = edits[line.item_id]
    if (e && e[field] !== undefined && e[field] !== '') return Number(e[field])
    if (e && e[field] === '') return 0
    return field === 'qty' ? Number(line.total_qty || 0) : Number(line.rate || 0)
  }
  const setEdit = (id, field, v) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [field]: v } }))

  const gstPct = Number(gst) || 0

  // Rebuilt from the edits on every keystroke, so the totals can never disagree with the rows
  // the operator is looking at — and the same computation feeds both exports.
  const computed = useMemo(() => {
    if (!data) return null
    const sections = []
    const seen = new Set()
    const bucket = (key, label, lines) => {
      if (lines.length) sections.push({ label, lines })
      lines.forEach(l => seen.add(l.item_id))
    }
    SECTIONS.forEach(s =>
      bucket(s.key, s.label, data.lines.filter(l => l.category === s.key)))
    const rest = data.lines.filter(l => !seen.has(l.item_id))
    if (rest.length) sections.push({ label: 'Other items', lines: rest })

    let subtotal = 0
    const rows = []
    sections.forEach(sec => {
      sec.rows = sec.lines.map(l => {
        const rate = val(l, 'rate'), qty = val(l, 'qty')
        const amount = rate * qty
        subtotal += amount
        const row = { ...l, rate, qty, amount, gst: amount * gstPct / 100 }
        rows.push(row)
        return row
      })
    })
    const gstAmount = subtotal * gstPct / 100
    return { sections, rows, subtotal, gstAmount, grand: subtotal + gstAmount }
  }, [data, edits, gstPct])

  function headerTitle() {
    const seg = SEGMENTS.find(s => s.value === segment)?.label || 'Sites'
    const n = data?.site_count || 0
    const who = data?.filters?.client_name ? `${data.filters.client_name} ` : ''
    return `SUMMARY - CONSUMABLES & SPARES CONSUMPTION OF ${who}${seg.toUpperCase()} (${n} ${n === 1 ? 'site' : 'sites'})`
  }
  const periodLabel = () => `PERIOD  ${dateFrom.split('-').reverse().join('-')} TO ${dateTo.split('-').reverse().join('-')}`

  const HEADERS = ['#', 'Item Description', 'Unit', 'Rate', 'Total Qty', 'Total Amount',
                   `GST @ ${gstPct}%`, 'Grand Total']

  function buildRows() {
    const out = []
    let n = 0
    computed.sections.forEach(sec => {
      out.push(['', sec.label, '', '', '', '', '', ''])   // section heading row
      sec.rows.forEach(r => {
        n += 1
        out.push([n, r.description, r.unit, money(r.rate), money(r.qty),
                  money(r.amount), money(r.gst), money(r.amount + r.gst)])
      })
    })
    out.push(['', 'Grand Total', '', '', '', money(computed.subtotal),
              money(computed.gstAmount), money(computed.grand)])
    return out
  }

  function downloadPdf() {
    if (!computed) return
    exportPDF({
      title: headerTitle(),
      subtitle: `${periodLabel()}      Sites: ${(data.sites || []).map(s => s.name).join(', ') || '—'}`,
      headers: HEADERS, rows: buildRows(),
      summaryRows: [
        `Total Amount: Rs.${money(computed.subtotal)}`,
        `GST @ ${gstPct}%: Rs.${money(computed.gstAmount)}`,
        `Grand Total: Rs.${money(computed.grand)}`,
        '',
        'For SRI HAMSINI & CHANDRA ENTERPRISES        Signature / Stamp: ______________________',
      ],
      filename: `Consumption_${dateFrom}_to_${dateTo}.pdf`,
    })
  }

  function downloadExcel() {
    if (!computed) return
    exportExcel([{
      name: 'Consumption', headers: HEADERS,
      rows: [
        [headerTitle(), '', '', '', '', '', '', ''],
        [periodLabel(), '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ...buildRows(),
      ],
    }], `Consumption_${dateFrom}_to_${dateTo}.xlsx`)
  }

  const siteOptions = useMemo(() => sites
    .filter(s => !segment || s.model === segment)
    .filter(s => !clientId || String(s.client_id) === String(clientId))
    .map(s => ({ value: String(s.id), label: s.name })), [sites, segment, clientId])

  return (
    <div>
      <div className="section-header">
        <h3>🧾 Consumption Summary</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Consumables &amp; spares used, priced from the client's rate list
        </span>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label style={{ fontSize: 10 }}>Client (sets the rates)</label>
            <SearchableSelect value={clientId} onChange={setClientId} placeholder="All clients"
              options={clients.map(c => ({ value: String(c.id), label: c.name }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>Site type</label>
            <select value={segment} onChange={e => { setSegment(e.target.value); setSchoolId('') }}>
              {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>Contract</label>
            <select value={contract} onChange={e => setContract(e.target.value)}>
              {CONTRACTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
            <label style={{ fontSize: 10 }}>One specific site (optional)</label>
            <SearchableSelect value={schoolId} onChange={setSchoolId} placeholder="All sites"
              options={siteOptions} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: 90 }}>
            <label style={{ fontSize: 10 }}>GST %</label>
            <input type="number" min="0" max="100" step="0.01" value={gst}
              onChange={e => setGst(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            {loading ? '⏳ Building…' : '📊 Build Summary'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>{error}</div>}

      {data && data.lines.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 34 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📭</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Nothing recorded for those filters.</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>
            {data.empty_reason}
          </div>
        </div>
      )}

      {computed && data.lines.length > 0 && (
        <>
          {data.lines_missing_rate > 0 && (
            <div className="alert alert-yellow" style={{ marginBottom: 12, display: 'block' }}>
              ⚠️ <b>{data.lines_missing_rate}</b> item{data.lines_missing_rate > 1 ? 's have' : ' has'} no
              agreed rate {data.filters.client_name ? `for ${data.filters.client_name}` : '(no client selected)'}.
              They are priced at 0 until a rate is set on the <b>Item Rates</b> page, or typed in below.
            </div>
          )}

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{headerTitle()}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{periodLabel()}</div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Item Description</th><th>Unit</th>
                    <th style={{ width: 110 }}>Rate</th>
                    <th style={{ width: 110 }}>Total Qty</th>
                    <th>Total Amount</th><th>GST @ {gstPct}%</th><th>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.sections.map(sec => (
                    <>
                      <tr key={sec.label} style={{ background: 'var(--surface2)' }}>
                        <td colSpan={8} style={{ fontWeight: 700, fontSize: 12 }}>{sec.label}</td>
                      </tr>
                      {sec.rows.map((r, i) => (
                        <tr key={r.item_id}>
                          <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>
                            {r.description}
                            {r.rate_missing && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--yellow)' }}>
                                no agreed rate
                              </span>
                            )}
                            <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>
                              used at {r.sites_used_at} site{r.sites_used_at === 1 ? '' : 's'}
                            </div>
                          </td>
                          <td>{r.unit}</td>
                          <td>
                            <input type="number" min="0" step="0.01"
                              value={edits[r.item_id]?.rate ?? (r.rate || '')}
                              onChange={e => setEdit(r.item_id, 'rate', e.target.value)}
                              style={{ width: 92, fontSize: 12, padding: '4px 6px' }} />
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01"
                              value={edits[r.item_id]?.qty ?? r.total_qty}
                              onChange={e => setEdit(r.item_id, 'qty', e.target.value)}
                              style={{ width: 92, fontSize: 12, padding: '4px 6px' }} />
                          </td>
                          <td>{money(r.amount)}</td>
                          <td>{money(r.gst)}</td>
                          <td style={{ fontWeight: 700 }}>{money(r.amount + r.gst)}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr style={{ background: 'rgba(34,211,238,.08)' }}>
                    <td colSpan={5} style={{ fontWeight: 800 }}>Grand Total</td>
                    <td style={{ fontWeight: 800 }}>{money(computed.subtotal)}</td>
                    <td style={{ fontWeight: 800 }}>{money(computed.gstAmount)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--accent)' }}>{money(computed.grand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={downloadPdf}>⬇️ Download PDF</button>
              <button className="btn btn-outline" onClick={downloadExcel}>⬇️ Download Excel</button>
              {Object.keys(edits).length > 0 && (
                <button className="btn btn-outline" onClick={() => { setEdits({}); showToast('Edits cleared — showing recorded figures') }}>
                  ↩︎ Reset to recorded figures
                </button>
              )}
              <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
                Edits here affect the download only — nothing recorded is changed.
              </span>
            </div>
          </div>

          {data.sites?.length > 0 && (
            <div className="card" style={{ fontSize: 12 }}>
              <b>Sites included ({data.site_count}):</b>{' '}
              <span style={{ color: 'var(--muted)' }}>{data.sites.map(s => s.name).join(' · ')}</span>
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
