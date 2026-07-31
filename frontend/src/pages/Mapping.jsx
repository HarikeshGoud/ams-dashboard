import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

// Technician -> Mandal -> Site mapping.
//
// Two levels, because the daily task rotation reads them in that order: it first looks
// for sites assigned directly to the technician, and only if there are none does it fall
// back to every site in their mandals. So mapping mandals alone is already enough to get
// a technician working; the site level is for splitting a mandal between two people.
export default function Mapping() {
  const [overview, setOverview] = useState(null)
  const [empId, setEmpId] = useState('')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [mandalSearch, setMandalSearch] = useState('')
  const [draftMandals, setDraftMandals] = useState([])   // ids, order matters (first = primary default)
  const [draftPrimary, setDraftPrimary] = useState(null)
  const [openMandal, setOpenMandal] = useState(null)
  const [sites, setSites] = useState(null)
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)

  // Each toast cancels the previous one's timer. Without this, an earlier 9s timer
  // fires partway through a later toast and wipes it off screen early — the skipped-site
  // messages here are the longest in the app and the ones you least want cut short.
  const toastTimer = useRef(null)
  function showToast(msg, ms = 5000) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => { setToast(''); toastTimer.current = null }, ms)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function loadOverview() {
    api.get('/api/mapping/overview').then(r => setOverview(r.data))
  }
  useEffect(() => { loadOverview() }, [])

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
      .catch(e => showToast('❌ ' + (e.response?.data?.detail || 'Could not load that technician')))
      .finally(() => setLoading(false))
  }, [empId])

  const dirty = detail && (
    JSON.stringify([...draftMandals].sort()) !== JSON.stringify(detail.mandals.map(m => m.id).sort()) ||
    draftPrimary !== detail.primary_mandal_id
  )

  function toggleMandal(id) {
    setDraftMandals(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // Primary has to stay inside the selection — travel eligibility reads it.
      if (draftPrimary && !next.includes(draftPrimary)) setDraftPrimary(next[0] ?? null)
      if (!draftPrimary && next.length) setDraftPrimary(next[0])
      return next
    })
  }

  async function saveMandals() {
    setBusy(true)
    try {
      const r = await api.put(`/api/mapping/technician/${empId}/mandals`, {
        mandal_ids: draftMandals,
        primary_mandal_id: draftPrimary,
      })
      showToast(`✅ ${r.data.technician}: ${r.data.mandal_count} mandal(s) saved` +
                (r.data.primary_mandal_name ? ` · primary ${r.data.primary_mandal_name}` : ''))
      const d = await api.get(`/api/mapping/technician/${empId}`)
      setDetail(d.data)
      setDraftMandals(d.data.mandals.map(m => m.id))
      setDraftPrimary(d.data.primary_mandal_id)
      loadOverview()
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.detail || 'Could not save mandals'), 8000)
    }
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
      const d = await api.get(`/api/mapping/technician/${empId}`); setDetail(d.data)
      loadOverview()
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.detail || 'Assignment failed'), 8000)
    }
    setBusy(false)
  }

  const techs = overview?.technicians || []
  const selected = techs.find(t => String(t.id) === String(empId))
  const t = overview?.totals

  const visibleMandals = (detail?.all_mandals || []).filter(m =>
    !mandalSearch.trim() || m.name.toLowerCase().includes(mandalSearch.trim().toLowerCase()))

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>🗺️ Mapping</h2>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 16, display: 'block' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          Give a technician their <b>mandals</b> first — that alone is enough for daily tasks to start
          generating for them. Then open a mandal below only if you need to split its sites between two
          technicians. The <b>⭐ primary mandal</b> is the one that decides their travel allowance.
        </div>
      </div>

      {/* Coverage overview — the gaps are the point of this screen */}
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
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Technician</th><th style={th}>Mandals</th>
                <th style={th}>⭐ Primary</th><th style={th}>Sites</th><th style={th}>Shared</th>
              </tr>
            </thead>
            <tbody>
              {techs.map(x => (
                <tr key={x.id} onClick={() => setEmpId(String(x.id))}
                    style={{
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
          {/* ── Step 1: mandals ─────────────────────────────────────────────── */}
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
              The number after each mandal is how many sites it holds. Some mandals exist twice
              under different capitalisation — always pick the one with the sites, never the
              <b style={{ color: 'var(--yellow)' }}> 0 ⚠ </b>twin.
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
                      {/* The site count is load-bearing, not decoration. Several mandals exist
                          twice under different capitalisation (CHOUTUPPAL has 109 sites,
                          "Choutuppal" has 0), so picking on name alone can hand a technician
                          an empty territory that looks correctly mapped. */}
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
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  ⭐ marks the primary mandal. Unsaved changes.
                </span>
              )}
            </div>
          </div>

          {/* ── Step 2: sites within those mandals ──────────────────────────── */}
          <div className="card">
            <div className="card-title">
              Step 2 — Sites <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>(optional)</span>
            </div>

            {detail.mandals.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Save at least one mandal above first — sites are picked from within a technician's own mandals.
              </div>
            ) : (
              detail.mandals.map(m => (
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
                              onClick={() => runAssign(picked)}>
                              Assign selected ({picked.length})
                            </button>
                            <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
                              onClick={() => runAssign(picked, { slot: 'secondary' })}>
                              Add as 2nd technician
                            </button>
                            <button className="btn btn-danger btn-sm" disabled={busy || !picked.length}
                              onClick={() => { if (confirm(`Take over ${picked.length} site(s) from their current technician?`)) runAssign(picked, { overwrite: true }) }}>
                              ⚠ Take over
                            </button>
                            <button className="btn btn-outline btn-sm" disabled={busy || !picked.length}
                              onClick={() => { if (confirm(`Clear the technician on ${picked.length} site(s)? They'll belong to nobody.`)) runAssign(picked, { action: 'clear' }) }}>
                              Clear
                            </button>
                          </div>

                          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                            {sites.items.map(s => {
                              const on = picked.includes(s.id)
                              return (
                                <div key={s.id} onClick={() => setPicked(p => on ? p.filter(x => x !== s.id) : [...p, s.id])}
                                  style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    gap: 10, padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
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
                                    {s.held_by_me
                                      ? <span className="pill pill-cyan">theirs</span>
                                      : s.technician_name
                                        ? <span className="pill pill-gray">{s.technician_name}</span>
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
              ))
            )}
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 16px', fontSize: 12.5, boxShadow: 'var(--shadow-lg)', maxWidth: 'min(560px, 92vw)',
        }}>{toast}</div>
      )}
    </div>
  )
}

const th = { padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px' }

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
