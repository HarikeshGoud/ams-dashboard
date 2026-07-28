import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

// Every number here should read 0. Anything above 0 is data quietly going wrong —
// the kind of gap that otherwise only surfaces months later when someone opens an
// old report. The "Fix site links" section below repairs the most common one.
const SEV = {
  ok:    { color: 'var(--green)',  bg: 'rgba(52,211,153,.12)',  icon: '✅' },
  warn:  { color: 'var(--yellow)', bg: 'rgba(251,191,36,.12)',  icon: '⚠️' },
  error: { color: 'var(--red)',    bg: 'rgba(244,63,94,.12)',   icon: '🔴' },
}

export default function DataHealth() {
  const [health, setHealth]   = useState(null)
  const [unlinked, setUnlinked] = useState([])
  const [schools, setSchools] = useState([])
  const [picks, setPicks]     = useState({})     // taskId -> schoolId
  const [busy, setBusy]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState('')

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 4500) }

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/api/data-health/'),
      api.get('/api/data-health/unlinked-sites'),
      api.get('/api/schools/', { params: { limit: 2000 } }),
    ]).then(([h, u, s]) => {
      setHealth(h.data)
      setUnlinked(u.data?.items || [])
      setSchools(s.data?.items || s.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function link(taskId) {
    const schoolId = picks[taskId]
    if (!schoolId) { showToast('Pick the correct site first'); return }
    setBusy(taskId)
    try {
      const r = await api.patch(`/api/data-health/unlinked-sites/${taskId}`, { school_id: Number(schoolId) })
      const d = r.data
      showToast(`✅ Linked to ${d.school} — ${d.service_reports_updated} report(s), ${d.proof_reviews_updated} proof(s) updated, ${d.pdfs_rebuilt} PDF(s) rebuilt`)
      setUnlinked(list => list.filter(x => x.task_id !== taskId))
      setPicks(p => { const n = { ...p }; delete n[taskId]; return n })
      // Refresh the counts so the tiles reflect the repair straight away
      api.get('/api/data-health/').then(h => setHealth(h.data)).catch(() => {})
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.detail || 'Could not link that site'))
    }
    setBusy(null)
  }

  if (loading) return <div className="spinner" />

  const schoolOptions = schools.map(s => ({ value: String(s.id), label: s.name }))

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 6 }}>
        <h3>🩺 Data Health</h3>
        <button className="btn btn-outline btn-sm" onClick={load}>↻ Re-check</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Every count below should be <b>0</b>. Anything higher means records exist that are
        incomplete — the sort of gap that stays invisible on screen until someone opens an
        old report. Check this page occasionally rather than waiting to be surprised.
      </p>

      {health && (
        <div className={`alert ${health.all_clear ? 'alert-green' : 'alert-yellow'}`} style={{ display: 'block', marginBottom: 16 }}>
          {health.all_clear
            ? '✅ All checks clear — no data gaps found.'
            : `⚠️ ${health.problem_count} check${health.problem_count === 1 ? '' : 's'} need attention.`}
        </div>
      )}

      {/* Health tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(health?.checks || []).map(c => {
          const s = SEV[c.severity] || SEV.warn
          return (
            <div key={c.key} style={{
              background: 'var(--surface)', border: `1px solid ${c.count > 0 ? s.color : 'var(--border)'}`,
              borderLeft: `4px solid ${s.color}`, borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{c.count}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.55 }}>{c.detail}</div>
            </div>
          )
        })}
      </div>

      {/* ── The fixer ──────────────────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: 6 }}>
        <h3 style={{ fontSize: 15 }}>🔗 Fix site links {unlinked.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({unlinked.length} to review)</span>}</h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
        These visits had their site <b>typed as text</b> instead of picked from the site list, so
        they aren't tied to a site record — which is why Unit, Site Type and Mandal filters skip
        them, and their PDF shows no customer address. Pick the correct site and the report, its
        proof review and its PDF are all repaired together.
      </p>

      {unlinked.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--green)' }}>
          ✅ Every visit is linked to a site. Nothing to fix.
        </div>
      ) : (
        unlinked.map(it => (
          <div key={it.task_id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 14, marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>📍 {it.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {it.due_date && <>📅 {it.due_date} · </>}
                  {it.technician && <>👷 {it.technician} · </>}
                  📄 {it.service_reports} report{it.service_reports === 1 ? '' : 's'} · 📸 {it.proof_reviews} proof{it.proof_reviews === 1 ? '' : 's'}
                </div>
              </div>
              {it.suggestion && (
                <button
                  onClick={() => { setPicks(p => ({ ...p, [it.task_id]: String(it.suggestion.id) })) }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
                    background: it.suggestion.confidence >= 90 ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.15)',
                    border: `1px solid ${it.suggestion.confidence >= 90 ? 'var(--green)' : 'var(--yellow)'}`,
                    color: it.suggestion.confidence >= 90 ? 'var(--green)' : 'var(--yellow)',
                    alignSelf: 'flex-start', whiteSpace: 'nowrap',
                  }}
                  title="Use this suggestion — you can still change it below">
                  Suggested: {it.suggestion.name} ({it.suggestion.confidence}%)
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <SearchableSelect
                value={picks[it.task_id] || ''}
                onChange={v => setPicks(p => ({ ...p, [it.task_id]: v }))}
                placeholder="Search the correct site…"
                options={schoolOptions}
                style={{ minWidth: 300, flex: 1 }} />
              <button className="btn btn-primary btn-sm"
                disabled={!picks[it.task_id] || busy === it.task_id}
                onClick={() => link(it.task_id)}>
                {busy === it.task_id ? '⏳ Linking…' : '🔗 Link site'}
              </button>
            </div>
          </div>
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
