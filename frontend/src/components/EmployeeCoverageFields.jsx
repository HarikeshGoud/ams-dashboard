import { useState } from 'react'
import SearchableSelect from './SearchableSelect'

// Shared by the admin and deskwork employee forms — what a technician covers.
//
// Two things live here because they interact, and getting either wrong is quiet rather
// than loud:
//
//   mandals[]  drives daily task rotation and the Mapping page.
//   the ⭐ primary mandal is written to Employee.mandal_id, which is what decides TRAVEL
//   ALLOWANCE eligibility. Set the list without a primary and the technician silently
//   loses their allowance.
//
// The dedicated-site option pins a technician to one place they service every day (a
// temple, typically) instead of rotating. Rotation is bypassed for them entirely.
//
// Expects form to carry: role, coverage ('mandals' | 'dedicated'), mandal_ids[],
// primary_mandal_id, dedicated_school_id.
export const BLANK_COVERAGE = {
  mandal_ids: [], primary_mandal_id: '', coverage: 'mandals', dedicated_school_id: '',
}

// Turn an employee row from /api/employees/ into the coverage half of the form.
export function coverageFromEmployee(e) {
  return {
    mandal_ids: (e.mandals || []).map(m => m.id),
    primary_mandal_id: e.mandal_id || '',
    coverage: e.dedicated_school_id ? 'dedicated' : 'mandals',
    dedicated_school_id: e.dedicated_school_id || '',
  }
}

// Build the request payload. Always sends dedicated_school_id so switching back to mandal
// rotation actually clears the pin instead of leaving it silently in place.
export function coveragePayload(form) {
  const dedicated = form.coverage === 'dedicated'
  return {
    mandal_ids: (form.mandal_ids || []).map(Number),
    mandal_id: form.primary_mandal_id ? parseInt(form.primary_mandal_id) : null,
    dedicated_school_id: dedicated && form.dedicated_school_id
      ? parseInt(form.dedicated_school_id) : null,
  }
}

// Returns an error string, or '' when the coverage half is valid.
export function validateCoverage(form) {
  if (form.role === 'technician' && form.coverage === 'dedicated' && !form.dedicated_school_id) {
    return 'Pick the site this technician looks after every day.'
  }
  return ''
}

export default function EmployeeCoverageFields({ form, setForm, mandals, sites }) {
  const [mandalSearch, setMandalSearch] = useState('')

  function toggleMandal(id) {
    setForm(f => {
      const ids = f.mandal_ids || []
      const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
      let primary = f.primary_mandal_id
      if (primary && !next.includes(Number(primary))) primary = next[0] ?? ''
      if (!primary && next.length) primary = next[0]
      return { ...f, mandal_ids: next, primary_mandal_id: primary }
    })
  }

  const visible = (mandals || []).filter(m =>
    !mandalSearch.trim() || m.name.toLowerCase().includes(mandalSearch.trim().toLowerCase()))

  return (
    <>
      {form.role === 'technician' && (
        <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            What does this technician cover?
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 8 }}>
            <input type="radio" name="coverage" checked={form.coverage === 'mandals'}
              onChange={() => setForm(f => ({ ...f, coverage: 'mandals' }))}
              style={{ marginTop: 3, width: 'auto' }} />
            <span>
              <b style={{ fontSize: 13 }}>Mandals (normal)</b>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Daily tasks rotate through the sites in the mandals picked below — 5 a day.
              </div>
            </span>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="coverage" checked={form.coverage === 'dedicated'}
              onChange={() => setForm(f => ({ ...f, coverage: 'dedicated' }))}
              style={{ marginTop: 3, width: 'auto' }} />
            <span>
              <b style={{ fontSize: 13 }}>One site, every day</b>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                For a technician posted to a single temple or site. They get 1 task for that
                site daily. Proof photos are still required; the service report is optional for
                temples. Deskwork can add other tasks by hand any time.
              </div>
            </span>
          </label>

          {form.coverage === 'dedicated' && (
            <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Site they look after *</label>
              <SearchableSelect
                value={String(form.dedicated_school_id || '')}
                onChange={val => setForm(f => ({ ...f, dedicated_school_id: val }))}
                placeholder="Search for the temple / site…"
                options={(sites || []).map(s => ({
                  value: String(s.id),
                  label: `${s.name}${s.model && s.model !== 'school' ? ` · ${s.model}` : ''}` +
                         `${s.mandal_name ? ` — ${s.mandal_name}` : ''}`,
                }))} />
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
                Still set a mandal below — the ⭐ primary one decides their travel allowance.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Mandals <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
            ({(form.mandal_ids || []).length} selected)
          </span>
        </label>
        <input value={mandalSearch} onChange={e => setMandalSearch(e.target.value)}
          placeholder="Search mandals…" style={{ marginTop: 6, marginBottom: 6 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto',
                      padding: 8, border: '1px solid var(--border)', borderRadius: 9 }}>
          {visible.length === 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {(mandals || []).length === 0 ? 'No mandals yet.' : 'No mandal matches that search.'}
            </span>
          )}
          {visible.map(m => {
            const on = (form.mandal_ids || []).includes(m.id)
            const isPrimary = String(form.primary_mandal_id) === String(m.id)
            return (
              <span key={m.id} style={{ display: 'inline-flex' }}>
                <button type="button" onClick={() => toggleMandal(m.id)} style={{
                  fontSize: 11.5, padding: '5px 9px', cursor: 'pointer',
                  borderRadius: on ? '8px 0 0 8px' : 8,
                  background: on ? 'rgba(34,211,238,.18)' : 'var(--surface2)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  borderRight: on ? 'none' : undefined,
                  color: on ? 'var(--accent)' : 'var(--text)',
                }}>{on ? '✓ ' : ''}{m.name}</button>
                {on && (
                  <button type="button" title="Primary mandal — decides travel allowance"
                    onClick={() => setForm(f => ({ ...f, primary_mandal_id: m.id }))} style={{
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
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
          ⭐ marks the primary mandal. Manage the mandals themselves on the Mapping page.
        </div>
      </div>
    </>
  )
}
