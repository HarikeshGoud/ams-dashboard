import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

// Data management for the technician → mandal → site chain, in three tabs:
//
//   Technicians   which mandals (and optionally which individual sites) a technician covers
//   Sites         which mandal each site sits in
//   Mandals       add / rename / merge / delete the mandals themselves
//
// The daily task rotation reads the chain in that order: sites assigned directly to the
// technician first, and only if there are none does it fall back to every site in their
// mandals. So mapping mandals alone is enough to get a technician working.
const TABS = [
  { key: 'techs',   label: '👷 Technicians → Mandals' },
  { key: 'sites',   label: '🏫 Sites → Mandals'       },
  { key: 'mandals', label: '📍 Manage Mandals'        },
]

export default function Mapping() {
  const [tab, setTab] = useState('techs')
  const [toast, setToast] = useState('')

  // Each toast cancels the previous one's timer. Without this, an earlier long timer
  // fires partway through a later toast and wipes it off screen early — the messages
  // here are the longest in the app and the ones you least want cut short.
  const toastTimer = useRef(null)
  const showToast = useCallback((msg, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => { setToast(''); toastTimer.current = null }, ms)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const errMsg = (e, fallback) => '❌ ' + (e.response?.data?.detail || fallback)

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>🗺️ Mapping</h2>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(x => (
          <button key={x.key} onClick={() => setTab(x.key)} style={{
            padding: '7px 14px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
            fontWeight: tab === x.key ? 700 : 400,
            background: tab === x.key ? 'rgba(34,211,238,.16)' : 'var(--surface)',
            border: `1px solid ${tab === x.key ? 'var(--accent)' : 'var(--border)'}`,
            color: tab === x.key ? 'var(--accent)' : 'var(--muted)',
          }}>{x.label}</button>
        ))}
      </div>

      {tab === 'techs'   && <TechniciansTab   showToast={showToast} errMsg={errMsg} />}
      {tab === 'sites'   && <SitesTab         showToast={showToast} errMsg={errMsg} />}
      {tab === 'mandals' && <MandalsTab       showToast={showToast} errMsg={errMsg} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 16px', fontSize: 12.5, boxShadow: 'var(--shadow-lg)', maxWidth: 'min(620px, 92vw)',
        }}>{toast}</div>
      )}
    </div>
  )
}

/* ──────────────────────────── Technicians → Mandals ─────────────────────── */

function TechniciansTab({ showToast, errMsg }) {
  const [overview, setOverview] = useState(null)
  const [empId, setEmpId] = useState('')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mandalSearch, setMandalSearch] = useState('')
  const [draftMandals, setDraftMandals] = useState([])
  const [draftPrimary, setDraftPrimary] = useState(null)
  const [openMandal, setOpenMandal] = useState(null)
  const [sites, setSites] = useState(null)
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)

  const loadOverview = useCallback(() => {
    api.get('/api/mapping/overview').then(r => setOverview(r.data))
  }, [])
  useEffect(() => { loadOverview() }, [loadOverview])

  useEffect(() => {
    setDetail(null); setOpenMandal(null); setSites(null); setPicked([])
    if (!empId) return
    setLoading(true)
    api.get(`/api/mapping/technician/${empId}`)
      .then(r => {
        setDetail(r.data)
        setDraftMandals(r.data.mandals.map(m => m.id))
        setDraftPrimary(r.data.primary_mandal_id)
      })
      .catch(e => showToast(errMsg(e, 'Could not load that technician')))
      .finally(() => setLoading(false))
  }, [empId, showToast, errMsg])

  const dirty = detail && (
    JSON.stringify([...draftMandals].sort()) !== JSON.stringify(detail.mandals.map(m => m.id).sort()) ||
    draftPrimary !== detail.primary_mandal_id
  )

  function toggleMandal(id) {
    setDraftMandals(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (draftPrimary && !next.includes(draftPrimary)) setDraftPrimary(next[0] ?? null)
      if (!draftPrimary && next.length) setDraftPrimary(next[0])
      return next
    })
  }

  async function refreshDetail() {
    const d = await api.get(`/api/mapping/technician/${empId}`)
    setDetail(d.data)
    setDraftMandals(d.data.mandals.map(m => m.id))
    setDraftPrimary(d.data.primary_mandal_id)
  }

  async function saveMandals() {
    setBusy(true)
    try {
      const r = await api.put(`/api/mapping/technician/${empId}/mandals`, {
        mandal_ids: draftMandals, primary_mandal_id: draftPrimary,
      })
      showToast(`✅ ${r.data.technician}: ${r.data.mandal_count} mandal(s) saved` +
                (r.data.primary_mandal_name ? ` · primary ${r.data.primary_mandal_name}` : ''))
      await refreshDetail(); loadOverview()
    } catch (e) { showToast(errMsg(e, 'Could not save mandals'), 8000) }
    setBusy(false)
  }

  async function openSites(mandalId) {
    if (openMandal === mandalId) { setOpenMandal(null); setSites(null); setPicked([]); return }
    setOpenMandal(mandalId); setSites(null); setPicked([])
    const r = await api.get(`/api/mapping/mandal/${mandalId}/sites`, { params: { technician_id: empId } })
    setSites(r.data)
  }

  async function runAssign(schoolIds, { slot = 'primary', action = 'assign', overwrite = false } = {}) {
    if (!schoolIds.length) { showToast('Nothing selected.'); return }
    setBusy(true)
    try {
      const r = await api.post('/api/mapping/assign-sites', {
        technician_id: action === 'clear' ? null : Number(empId),
        school_ids: schoolIds, slot, action, overwrite,
      })
      const bits = [`${r.data.changed} site(s) ${action === 'clear' ? 'cleared' : 'assigned'}`]
      if (r.data.cascaded_sub_locations) bits.push(`${r.data.cascaded_sub_locations} sub-location(s) followed`)
      if (r.data.skipped.length) {
        bits.push(`${r.data.skipped.length} skipped (already held by ${
          [...new Set(r.data.skipped.map(s => s.held_by))].slice(0, 3).join(', ')}) — use Take over to reassign`)
      }
      showToast((r.data.skipped.length ? '⚠️ ' : '✅ ') + bits.join(' · '), 9000)
      const s = await api.get(`/api/mapping/mandal/${openMandal}/sites`, { params: { technician_id: empId } })
      setSites(s.data); setPicked([])
      await refreshDetail(); loadOverview()
    } catch (e) { showToast(errMsg(e, 'Assignment failed'), 8000) }
    setBusy(false)
  }

  const techs = overview?.technicians || []
  const t = overview?.totals
  const visibleMandals = (detail?.all_mandals || []).filter(m =>
    !mandalSearch.trim() || m.name.toLowerCase().includes(mandalSearch.trim().toLowerCase()))

  return (
    <>
      <div className="alert alert-blue" style={{ marginBottom: 16, display: 'block' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          Give a technician their <b>mandals</b> first — that alone is enough for daily tasks to start
          generating for them. Then open a mandal below only if you need to split its sites between two
          technicians. The <b>⭐ primary mandal</b> is the one that decides their travel allowance.
        </div>
      </div>

      {t && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <Kpi label="Technicians" value={t.technicians} sub={`${t.mandals} mandals · ${t.sites} sites`} />
          <Kpi label="No coverage at all" value={t.technicians_without_coverage}
               sub="Get no daily tasks generated" tone={t.technicians_without_coverage ? 'red' : 'green'} />
          <Kpi label="Legacy mandal only" value={t.technicians_legacy_mandal_only}
               sub="Working, but not mapped properly" tone={t.technicians_legacy_mandal_only ? 'yellow' : 'green'} />
          <Kpi label="Sites with no technician" value={t.sites_unassigned}
               sub={`of ${t.sites} total`} tone={t.sites_unassigned ? 'yellow' : 'green'} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Pick a technician</div>
        <SearchableSelect
          value={empId} onChange={setEmpId} placeholder="Select technician…"
          options={techs.map(x => ({
            value: String(x.id),
            label: `${x.name} [${x.employee_code}] — ${x.mandal_count} mandal(s), ${x.site_count} site(s)` +
                   (x.no_coverage ? '  ⚠ no coverage' : ''),
          }))}
        />
        <div className="scroll-table" style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={th}>Technician</th><th style={th}>Mandals</th>
              <th style={th}>⭐ Primary</th><th style={th}>Sites</th><th style={th}>Shared</th>
            </tr></thead>
            <tbody>
              {techs.map(x => (
                <tr key={x.id} onClick={() => setEmpId(String(x.id))} style={{
                  cursor: 'pointer', borderTop: '1px solid var(--border)',
                  background: String(x.id) === String(empId) ? 'var(--accent-soft)' : 'transparent',
                }}>
                  <td style={td}>
                    <b>{x.name}</b> <span style={{ color: 'var(--muted)' }}>[{x.employee_code}]</span>
                    {x.no_coverage && <span className="pill pill-red" style={{ marginLeft: 6 }}>no coverage</span>}
                    {x.legacy_mandal_only && (
                      <span className="pill pill-yellow" style={{ marginLeft: 6 }}
                            title="Gets tasks only through the old single-mandal fallback — map their mandals here to make it explicit">
                        legacy only
                      </span>
                    )}
                  </td>
                  <td style={td}>{x.mandal_count || <span style={{ color: 'var(--red)' }}>0</span>}</td>
                  <td style={td}>{x.primary_mandal_name || <span style={{ color: 'var(--yellow)' }}>— none</span>}</td>
                  <td style={td}>{x.site_count}</td>
                  <td style={td}>{x.shared_site_count || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div className="card" style={{ marginBottom: 16 }}>Loading…</div>}

      {detail && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              Step 1 — Mandals for {detail.technician.name}
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                {draftMandals.length} selected
              </span>
            </div>

            <input value={mandalSearch} onChange={e => setMandalSearch(e.target.value)}
                   placeholder="Search mandals…" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              The number after each mandal is how many sites it holds. Any showing
              <b style={{ color: 'var(--yellow)' }}> 0 ⚠ </b>hold none — check the Manage Mandals tab
              for a duplicate holding the real sites.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 230, overflowY: 'auto',
                          padding: 8, border: '1px solid var(--border)', borderRadius: 10 }}>
              {visibleMandals.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: 6 }}>No mandal matches that search.</div>
              )}
              {visibleMandals.map(m => {
                const on = draftMandals.includes(m.id)
                const isPrimary = draftPrimary === m.id
                return (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                    <button type="button" onClick={() => toggleMandal(m.id)} style={{
                      fontSize: 11.5, padding: '5px 9px', cursor: 'pointer',
                      borderRadius: on ? '8px 0 0 8px' : 8,
                      background: on ? 'rgba(34,211,238,.18)' : 'var(--surface2)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      borderRight: on ? 'none' : undefined,
                      color: on ? 'var(--accent)' : 'var(--text)',
                    }}>
                      {on ? '✓ ' : ''}{m.name}
                      <span style={{
                        marginLeft: 5, fontWeight: 700,
                        color: m.site_total === 0 ? 'var(--yellow)' : 'var(--muted)',
                      }} title={m.site_total === 0 ? 'This mandal has no sites — check for a duplicate spelling' : `${m.site_total} sites`}>
                        {m.site_total === 0 ? '0 ⚠' : m.site_total}
                      </span>
                    </button>
                    {on && (
                      <button type="button" title="Make this the primary mandal (drives travel allowance)"
                        onClick={() => setDraftPrimary(m.id)} style={{
                          fontSize: 11.5, padding: '5px 8px', cursor: 'pointer', borderRadius: '0 8px 8px 0',
                          background: isPrimary ? 'rgba(251,191,36,.22)' : 'var(--surface2)',
                          border: `1px solid ${isPrimary ? 'var(--yellow)' : 'var(--border)'}`,
                          color: isPrimary ? 'var(--yellow)' : 'var(--muted)',
                        }}>{isPrimary ? '⭐' : '☆'}</button>
                    )}
                  </span>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={saveMandals} disabled={busy || !dirty}>
                {busy ? '⏳ Saving…' : dirty ? '💾 Save mandals' : '✓ Saved'}
              </button>
              {draftMandals.length === 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--yellow)' }}>
                  Saving with none selected removes this technician's territory — they'd stop getting daily tasks.
                </span>
              )}
              {dirty && draftMandals.length > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>⭐ marks the primary mandal. Unsaved changes.</span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              Step 2 — Sites <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>(optional)</span>
            </div>
            {detail.mandals.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Save at least one mandal above first — sites are picked from within a technician's own mandals.
              </div>
            ) : detail.mandals.map(m => (
              <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                <button onClick={() => openSites(m.id)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none',
                  border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {m.is_primary && '⭐ '}{m.name}
                    <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 11.5 }}>
                      {m.site_total} site(s)
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pill pill-cyan">{m.mine} theirs</span>
                    {m.shared_with_me > 0 && <span className="pill pill-purple">{m.shared_with_me} shared</span>}
                    {m.others > 0 && <span className="pill pill-gray">{m.others} other tech</span>}
                    {m.unassigned > 0 && <span className="pill pill-yellow">{m.unassigned} unassigned</span>}
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{openMandal === m.id ? '▲' : '▼'}</span>
                  </span>
                </button>

                {openMandal === m.id && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
                    {!sites ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading sites…</div> : (
                      <>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          <button className="btn btn-outline btn-sm" disabled={busy}
                            onClick={() => runAssign(sites.items.filter(s => !s.technician_id).map(s => s.id))}>
                            ➕ Assign all unassigned ({sites.items.filter(s => !s.technician_id).length})
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
                            onClick={() => runAssign(picked)}>Assign selected ({picked.length})</button>
                          <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
                            onClick={() => runAssign(picked, { slot: 'secondary' })}>Add as 2nd technician</button>
                          <button className="btn btn-danger btn-sm" disabled={busy || !picked.length}
                            onClick={() => { if (confirm(`Take over ${picked.length} site(s) from their current technician?`)) runAssign(picked, { overwrite: true }) }}>
                            ⚠ Take over</button>
                          <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
                            onClick={() => { if (confirm(`Clear the technician on ${picked.length} site(s)? They'll belong to nobody.`)) runAssign(picked, { action: 'clear' }) }}>
                            Clear</button>
                        </div>
                        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                          {sites.items.map(s => {
                            const on = picked.includes(s.id)
                            return (
                              <div key={s.id} onClick={() => setPicked(p => on ? p.filter(x => x !== s.id) : [...p, s.id])}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                                  padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
                                  borderBottom: '1px solid var(--border)',
                                  background: on ? 'var(--accent-soft)' : 'transparent',
                                }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                  <span style={{ color: on ? 'var(--accent)' : 'var(--muted)' }}>{on ? '☑' : '☐'}</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.name}
                                    {s.sub_location_count > 0 && (
                                      <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>
                                        ({s.sub_location_count} sub-locations — they follow)
                                      </span>
                                    )}
                                  </span>
                                </span>
                                <span style={{ flexShrink: 0 }}>
                                  {s.held_by_me ? <span className="pill pill-cyan">theirs</span>
                                    : s.technician_name ? <span className="pill pill-gray">{s.technician_name}</span>
                                    : <span className="pill pill-yellow">unassigned</span>}
                                  {s.shared_with_me && <span className="pill pill-purple" style={{ marginLeft: 4 }}>2nd</span>}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ──────────────────────────────── Sites → Mandals ───────────────────────── */

function SitesTab({ showToast, errMsg }) {
  const [mandals, setMandals] = useState([])
  const [search, setSearch] = useState('')
  const [filterMandal, setFilterMandal] = useState('')
  const [data, setData] = useState(null)
  const [picked, setPicked] = useState([])
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [campus, setCampus] = useState(null)   // the site whose stops are being managed

  useEffect(() => { api.get('/api/mapping/mandals').then(r => setMandals(r.data.items)) }, [])

  const load = useCallback(() => {
    // Load every match, not a page of them. A cap here made "Select all" a lie: it
    // selected only what had loaded, so a bulk move silently acted on part of the filter.
    const params = { limit: 3000 }
    if (search.trim()) params.search = search.trim()
    if (filterMandal) params.mandal_id = Number(filterMandal)
    api.get('/api/mapping/sites', { params }).then(r => { setData(r.data); setPicked([]) })
  }, [search, filterMandal])
  useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id) }, [load])

  // "Select all" can now genuinely mean every site in the business, so a stray click on
  // Move would re-home the lot into one mandal — tedious to unpick by hand. Confirm the
  // big ones; small corrections stay a single click.
  const BULK_CONFIRM_AT = 25

  async function apply(clear = false) {
    if (!picked.length) { showToast('Select some sites first.'); return }
    if (!clear && !target) { showToast('Pick the mandal to move them into.'); return }
    if (clear && !confirm(`Clear the mandal on ${picked.length} site(s)? They'll drop out of every Mandal filter.`)) return
    if (!clear && picked.length >= BULK_CONFIRM_AT) {
      const name = mandals.find(m => String(m.id) === String(target))?.name || 'that mandal'
      if (!confirm(`Move ${picked.length} site(s) into "${name}"?\n\n` +
                   `That is a large change and there is no undo — each site would have to be ` +
                   `moved back by hand.`)) return
    }
    setBusy(true)
    try {
      const r = await api.post('/api/mapping/assign-mandal', {
        mandal_id: clear ? null : Number(target), school_ids: picked,
      })
      const bits = [`${r.data.changed} site(s) ${clear ? 'cleared' : `moved into ${r.data.mandal}`}`]
      if (r.data.cascaded_sub_locations) bits.push(`${r.data.cascaded_sub_locations} sub-location(s) followed`)
      showToast('✅ ' + bits.join(' · '))
      load()
      api.get('/api/mapping/mandals').then(x => setMandals(x.data.items))
    } catch (e) { showToast(errMsg(e, 'Could not move those sites'), 8000) }
    setBusy(false)
  }

  const mandalOptions = [
    { value: '-1', label: '— No mandal (needs fixing) —' },
    ...mandals.map(m => ({ value: String(m.id), label: `${m.name} (${m.site_count})` })),
  ]

  return (
    <>
      <div className="alert alert-blue" style={{ marginBottom: 16, display: 'block' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          Which mandal each site sits in. This drives the <b>Mandal filters</b> on Service Reports and the
          fallback the daily rotation uses, so a site with no mandal quietly disappears from both.
          Sub-locations always follow their parent.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Find sites</div>
        <div className="form-grid" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '2 1 220px', marginBottom: 0 }}>
            <label>Search by name</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. MPPS NELAPATLA…" />
          </div>
          <div className="form-group" style={{ flex: '2 1 220px', marginBottom: 0 }}>
            <label>Filter by current mandal</label>
            <SearchableSelect value={filterMandal} onChange={setFilterMandal}
              placeholder="Any mandal…" options={mandalOptions} />
          </div>
        </div>

        {data && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
            {data.truncated
              ? <>Showing {data.showing} of {data.total} matching site(s).
                  <b style={{ color: 'var(--yellow)' }}> Narrow the search to see the rest.</b></>
              : <>All {data.total} matching site(s) shown.</>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Move sites into a mandal</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ flex: '2 1 240px', marginBottom: 0 }}>
            <label>Move the selected {picked.length} site(s) into</label>
            <SearchableSelect value={target} onChange={setTarget} placeholder="Choose mandal…"
              options={mandals.map(m => ({ value: String(m.id), label: `${m.name} (${m.site_count})` }))} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !picked.length || !target}
            onClick={() => apply(false)}>{busy ? '⏳ Moving…' : `✅ Move ${picked.length}`}</button>
          <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
            onClick={() => apply(true)}>Clear mandal</button>
          {data?.items?.length > 0 && (
            <button className="btn btn-outline btn-sm"
              onClick={() => setPicked(picked.length === data.items.length ? [] : data.items.map(s => s.id))}>
              {picked.length === data.items.length ? 'Deselect all' : `Select all ${data.items.length}`}
            </button>
          )}
        </div>

        {!data ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
          : data.items.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No site matches that.</div>
          : (
            <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {data.items.map(s => {
                const on = picked.includes(s.id)
                return (
                  <div key={s.id} onClick={() => setPicked(p => on ? p.filter(x => x !== s.id) : [...p, s.id])}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
                      borderBottom: '1px solid var(--border)',
                      background: on ? 'var(--accent-soft)' : 'transparent',
                    }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ color: on ? 'var(--accent)' : 'var(--muted)' }}>{on ? '☑' : '☐'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                        {s.technician_name && (
                          <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>· {s.technician_name}</span>
                        )}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* A campus is where the daily/weekly split per stop is set. */}
                      {s.sub_location_count > 0 && (
                        <button onClick={e => { e.stopPropagation(); setCampus(s) }}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                                   background: 'rgba(167,139,250,.15)', color: 'var(--purple)',
                                   border: '1px solid var(--purple)', cursor: 'pointer' }}>
                          🏛 {s.sub_location_count} stops
                        </button>
                      )}
                      {s.mandal_name ? <span className="pill pill-cyan">{s.mandal_name}</span>
                                     : <span className="pill pill-red">no mandal</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {campus && (
        <CampusModal site={campus} onClose={() => setCampus(null)}
          showToast={showToast} errMsg={errMsg} />
      )}
    </>
  )
}

/* ─────────────────── Campus stops: daily vs weekly ──────────────────────── */

// A campus like YADADRI TEMPLE is 22 named stops covered by a team every day. This is where
// the ones that only need a weekly visit get marked — they then stay out of the daily round
// until 7 days after their last visit, so nobody has to remember a fixed day.
function CampusModal({ site, onClose, showToast, errMsg }) {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/api/mapping/campus/${site.id}`).then(r => { setData(r.data); setSel([]) })
      .catch(e => showToast(errMsg(e, 'Could not load this site')))
  }, [site.id, showToast, errMsg])
  useEffect(() => { load() }, [load])

  async function setFreq(freq) {
    if (!sel.length) { showToast('Select some stops first.'); return }
    setBusy(true)
    try {
      const r = await api.post('/api/mapping/visit-frequency', {
        school_ids: sel, visit_frequency: freq,
      })
      showToast(`✅ ${r.data.changed} stop(s) set to ${freq}`)
      load()
    } catch (e) { showToast(errMsg(e, 'Could not change that'), 8000) }
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 620 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>🏛 {site.name}</h3>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Which stops are visited daily, and which only once a week.
        </div>

        {!data ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div> : (
          <>
            <div className="kpi-grid" style={{ marginBottom: 12 }}>
              <Kpi label="Stops" value={data.sub_location_count} sub="On this campus" />
              <Kpi label="Due today" value={data.due_today} sub="The shared round" />
              <Kpi label="Weekly" value={data.weekly_count}
                   sub={`Return after ${data.weekly_gap_days} days`} tone={data.weekly_count ? 'yellow' : undefined} />
              <Kpi label="Posted here" value={data.posted_technicians.length}
                   sub={data.posted_technicians.length ? 'Share the round' : 'Nobody posted yet'}
                   tone={data.posted_technicians.length ? 'green' : 'yellow'} />
            </div>

            {data.posted_technicians.length > 0 && (
              <div style={{ fontSize: 11.5, background: 'rgba(52,211,153,.08)', border: '1px solid var(--green)',
                            borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.6 }}>
                {data.posted_technicians.map(p => (
                  <div key={p.id}>
                    <b>{p.name}</b> [{p.employee_code}] — full day at <b>{p.effective_target}</b> visits
                    {!p.daily_task_target && <span style={{ color: 'var(--muted)' }}> (derived from the round)</span>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button className="btn btn-outline btn-sm" disabled={busy || !sel.length}
                onClick={() => setFreq('weekly')}>📅 Mark weekly ({sel.length})</button>
              <button className="btn btn-outline btn-sm" disabled={busy || !sel.length}
                onClick={() => setFreq('daily')}>🔁 Mark daily ({sel.length})</button>
              <button className="btn btn-outline btn-sm"
                onClick={() => setSel(sel.length === data.items.length ? [] : data.items.map(i => i.id))}>
                {sel.length === data.items.length ? 'Deselect all' : `Select all ${data.items.length}`}
              </button>
            </div>

            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {data.items.map(i => {
                const on = sel.includes(i.id)
                return (
                  <div key={i.id} onClick={() => setSel(p => on ? p.filter(x => x !== i.id) : [...p, i.id])}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
                      borderBottom: '1px solid var(--border)',
                      background: on ? 'var(--accent-soft)' : 'transparent',
                    }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ color: on ? 'var(--accent)' : 'var(--muted)' }}>{on ? '☑' : '☐'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {i.name}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, display: 'flex', gap: 5, alignItems: 'center' }}>
                      {i.visit_frequency === 'weekly'
                        ? <span className="pill pill-yellow">weekly</span>
                        : <span className="pill pill-cyan">daily</span>}
                      {i.due_today
                        ? <span className="pill pill-green">due today</span>
                        : <span className="pill pill-gray">
                            {i.days_since_visit != null ? `${i.days_since_visit}d ago` : 'not due'}
                          </span>}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
              Weekly stops rejoin the round {data.weekly_gap_days} days after their last visit — no fixed
              day to remember, and a missed day doesn't push them out by a whole extra week.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────── Manage Mandals ────────────────────────── */

function MandalsTab({ showToast, errMsg }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', district: 'Nalgonda', state: 'Telangana' })
  const [editing, setEditing] = useState(null)      // id
  const [editDraft, setEditDraft] = useState({ name: '', district: '', state: '' })
  const [mergeInto, setMergeInto] = useState({})    // {sourceId: targetId}
  const [search, setSearch] = useState('')

  const load = useCallback(() => { api.get('/api/mapping/mandals').then(r => setData(r.data)) }, [])
  useEffect(() => { load() }, [load])

  async function addMandal() {
    if (!form.name.trim()) { showToast('Enter a mandal name.'); return }
    setBusy(true)
    try {
      const r = await api.post('/api/mapping/mandals', form)
      showToast(`✅ Added ${r.data.name}`)
      setForm({ name: '', district: form.district, state: form.state })
      load()
    } catch (e) { showToast(errMsg(e, 'Could not add that mandal'), 9000) }
    setBusy(false)
  }

  async function saveEdit(id) {
    setBusy(true)
    try {
      const r = await api.patch(`/api/mapping/mandals/${id}`, editDraft)
      showToast(`✅ Saved ${r.data.name}`)
      setEditing(null); load()
    } catch (e) { showToast(errMsg(e, 'Could not save'), 9000) }
    setBusy(false)
  }

  async function removeMandal(m) {
    // A mandal with no sites can still be referenced by staff records, usually inactive
    // ones left over from the original data load. Those are safe to detach, but the
    // confirmation has to say so rather than leaving a dead button with no explanation.
    const needsForce = !m.deletable && m.force_deletable
    const msg = needsForce
      ? `Delete "${m.name}"?\n\nIt holds no sites, but it is still referenced by:\n  • ${
          m.blocked_by.join('\n  • ')}\n\nThose references will be detached. ` +
        `An employee with no primary mandal just has no mandal-based travel rule.\n\nThis cannot be undone.`
      : `Delete "${m.name}"? Nothing references it, so this is safe.`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      const r = await api.delete(`/api/mapping/mandals/${m.id}`, { params: { force: needsForce } })
      const extra = []
      if (r.data.detached_primary_mandal) extra.push(`${r.data.detached_primary_mandal} primary mandal reference(s) detached`)
      if (r.data.detached_mandal_links) extra.push(`${r.data.detached_mandal_links} mandal assignment(s) detached`)
      showToast(`✅ Deleted ${r.data.deleted}` + (extra.length ? ` — ${extra.join(', ')}` : ''), 8000)
      load()
    } catch (e) { showToast(errMsg(e, 'Could not delete'), 10000) }
    setBusy(false)
  }

  async function doMerge(src, targetId) {
    const dst = data.items.find(x => x.id === Number(targetId))
    if (!dst) { showToast('Pick a mandal to merge into.'); return }
    // Quote the TOTAL reference counts, not the operational ones. A mandal can show
    // "0 sites, 0 tech" and still be some inactive employee's primary mandal — saying
    // "0 and 0" before an irreversible merge would be a lie by omission.
    const moves = []
    if (src.total_site_refs) moves.push(`${src.total_site_refs} site(s)`)
    if (src.total_technician_link_refs) moves.push(`${src.total_technician_link_refs} technician mandal link(s)`)
    if (src.total_legacy_refs) moves.push(`${src.total_legacy_refs} employee(s) whose primary mandal it is (this affects their travel allowance)`)
    if (!confirm(
      `Merge "${src.name}" into "${dst.name}"?\n\n` +
      (moves.length ? `Moving across:\n  • ${moves.join('\n  • ')}\n\n`
                    : 'Nothing references it, so nothing moves.\n\n') +
      `Then "${src.name}" is deleted.\n\nThis cannot be undone.`
    )) return
    setBusy(true)
    try {
      const r = await api.post(`/api/mapping/mandals/${src.id}/merge`, { into_mandal_id: Number(targetId) })
      showToast(`✅ Merged ${r.data.merged} into ${r.data.into} — ${r.data.sites_moved} site(s), ` +
                `${r.data.technician_links_moved} technician link(s) moved` +
                (r.data.legacy_primaries_repointed ? `, ${r.data.legacy_primaries_repointed} primary mandal(s) repointed` : ''), 10000)
      setMergeInto(p => ({ ...p, [src.id]: '' })); load()
    } catch (e) { showToast(errMsg(e, 'Merge failed'), 10000) }
    setBusy(false)
  }

  if (!data) return <div className="card">Loading mandals…</div>

  const byId = Object.fromEntries(data.items.map(m => [m.id, m]))
  const visible = data.items.filter(m =>
    !search.trim() || m.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Mandals" value={data.totals.mandals} sub="Total records" />
        <Kpi label="Duplicate names" value={data.totals.duplicate_groups}
             sub="Same name, different rows" tone={data.totals.duplicate_groups ? 'red' : 'green'} />
        <Kpi label="Holding no sites" value={data.totals.empty}
             sub="Often the duplicate to merge away" tone={data.totals.empty ? 'yellow' : 'green'} />
        <Kpi label="Can be deleted" value={data.totals.removable}
             sub={data.totals.deletable === data.totals.removable
                    ? 'Nothing references them'
                    : `${data.totals.deletable} clean, ${data.totals.removable - data.totals.deletable} need staff refs detached`} />
      </div>

      {data.duplicate_groups.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--red)' }}>
          <div className="card-title" style={{ color: 'var(--red)' }}>
            ⚠ Duplicate mandal names ({data.duplicate_groups.length})
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
            These exist more than once under different capitalisation. Merging moves every site,
            technician link and primary-mandal reference into the one you keep, then deletes the other —
            so nothing is lost. Keep the one holding the sites.
          </div>
          {data.duplicate_groups.map(g => {
            const members = g.mandal_ids.map(i => byId[i]).filter(Boolean)
            const keep = [...members].sort((a, b) => b.site_count - a.site_count)[0]
            const losers = members.filter(m => m.id !== keep.id)
            return (
              <div key={g.name} style={{
                border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 12.5 }}>
                  {members.map(m => (
                    <span key={m.id} style={{ marginRight: 10 }}>
                      <b style={{ color: m.id === keep.id ? 'var(--green)' : 'var(--muted)' }}>{m.name}</b>
                      <span style={{ color: 'var(--muted)' }}> · {m.site_count} sites, {m.technician_count} tech</span>
                      {/* An apparently empty duplicate can still be somebody's primary mandal. */}
                      {m.total_legacy_refs > 0 && (
                        <span style={{ color: 'var(--yellow)' }} title="Employees using this as their primary mandal — a merge repoints them">
                          , ⭐{m.total_legacy_refs} primary
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {losers.map(l => (
                    <button key={l.id} className="btn btn-danger btn-sm" disabled={busy}
                      onClick={() => doMerge(l, keep.id)}>
                      Merge "{l.name}" → "{keep.name}"
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Add a mandal</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '2 1 200px', marginBottom: 0 }}>
            <label>Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                   placeholder="e.g. BHOODAN POCHAMPALLY" />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
            <label>District</label>
            <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
            <label>State</label>
            <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
              <option value="Telangana">Telangana</option>
              <option value="Andhra Pradesh">Andhra Pradesh</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addMandal} disabled={busy || !form.name.trim()}>
            {busy ? '⏳' : '➕ Add'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">All mandals ({data.items.length})</div>
        <input value={search} onChange={e => setSearch(e.target.value)}
               placeholder="Search mandals…" style={{ marginBottom: 10 }} />

        <div className="scroll-table" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={th}>Mandal</th><th style={th}>District</th><th style={th}>State</th>
              <th style={th}>Sites</th><th style={th}>Techs</th><th style={th}>Actions</th>
            </tr></thead>
            <tbody>
              {visible.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  {editing === m.id ? (
                    <>
                      <td style={td}><input value={editDraft.name}
                        onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} /></td>
                      <td style={td}><input value={editDraft.district}
                        onChange={e => setEditDraft(d => ({ ...d, district: e.target.value }))} /></td>
                      <td style={td}>
                        <select value={editDraft.state}
                          onChange={e => setEditDraft(d => ({ ...d, state: e.target.value }))}>
                          <option value="Telangana">Telangana</option>
                          <option value="Andhra Pradesh">Andhra Pradesh</option>
                        </select>
                      </td>
                      <td style={td}>{m.site_count}</td>
                      <td style={td}>{m.technician_count}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => saveEdit(m.id)}>Save</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>
                        <b>{m.name}</b>
                        {m.duplicate_of.length > 0 && (
                          <span className="pill pill-red" style={{ marginLeft: 6 }}>duplicate</span>
                        )}
                        {/* Say why Delete is off. The Sites and Techs columns can both read 0
                            while an inactive staff record still holds the reference, which
                            otherwise leaves a dead button and no explanation. */}
                        {!m.deletable && (
                          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                            {m.force_deletable ? '🔓 ' : '🔒 '}{m.blocked_by.join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={td}>{m.district || '—'}</td>
                      <td style={td}>{m.state}</td>
                      <td style={{ ...td, color: m.site_count === 0 ? 'var(--yellow)' : 'var(--text)', fontWeight: 700 }}>
                        {m.site_count}
                      </td>
                      <td style={td}>
                        {m.technician_count}
                        {m.legacy_primary_count > 0 && (
                          <span style={{ color: 'var(--muted)' }} title="Technicians using this as their primary mandal">
                            {' '}(⭐{m.legacy_primary_count})
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => {
                            setEditing(m.id)
                            setEditDraft({ name: m.name, district: m.district || '', state: m.state })
                          }}>Rename</button>

                          <select value={mergeInto[m.id] || ''} style={{ maxWidth: 150, fontSize: 11 }}
                            onChange={e => setMergeInto(p => ({ ...p, [m.id]: e.target.value }))}>
                            <option value="">Merge into…</option>
                            {data.items.filter(o => o.id !== m.id)
                              .map(o => <option key={o.id} value={o.id}>{o.name} ({o.site_count})</option>)}
                          </select>
                          {mergeInto[m.id] && (
                            <button className="btn btn-danger btn-sm" disabled={busy}
                              onClick={() => doMerge(m, mergeInto[m.id])}>Go</button>
                          )}

                          <button className="btn btn-danger btn-sm"
                            disabled={busy || !(m.deletable || m.force_deletable)}
                            title={m.deletable ? 'Nothing references this mandal'
                              : m.force_deletable ? 'Holds no sites — deleting will detach the staff references'
                              : 'Still has sites in it — merge it, or move the sites in the Sites tab first'}
                            onClick={() => removeMandal(m)}>
                            {m.deletable ? 'Delete' : m.force_deletable ? 'Delete…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

const th = { padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', verticalAlign: 'middle' }

function Kpi({ label, value, sub, tone }) {
  const color = tone === 'red' ? 'var(--red)' : tone === 'yellow' ? 'var(--yellow)'
              : tone === 'green' ? 'var(--green)' : 'var(--text)'
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
