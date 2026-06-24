import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

const CONDITION_COLOR = { working: 'var(--green)', not_working: 'var(--red)', partial: 'var(--yellow)' }
const CONDITION_LABEL = { working: '✅ Working', not_working: '❌ Not Working', partial: '⚠️ Partial' }

function LogVisitModal({ onClose, onSaved, employeeId }) {
  const today = new Date().toISOString().slice(0, 10)
  const [schools, setSchools] = useState([])
  const [form, setForm] = useState({
    school_id: '',
    visit_date: today,
    visit_type: 'routine',
    plant_condition: 'working',
    not_working_reason: '',
    tds_reading: '',
    ph_reading: '',
    mcf_used: '',
    filters_used: '',
    antiscalant_used: '',
    spares_used: '',
    work_done: '',
    remarks: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/schools/?limit=300').then(r => setSchools(r.data?.items || r.data || []))
  }, [])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    if (!form.school_id) { setError('Select a school'); return }
    setLoading(true); setError('')
    try {
      await api.post('/api/visits/', {
        employee_id: employeeId,
        school_id: Number(form.school_id),
        visit_date: form.visit_date,
        visit_type: form.visit_type,
        plant_condition: form.plant_condition,
        not_working_reason: form.plant_condition !== 'working' ? form.not_working_reason : null,
        tds_reading: form.tds_reading ? Number(form.tds_reading) : null,
        ph_reading: form.ph_reading ? Number(form.ph_reading) : null,
        mcf_used: form.mcf_used ? Number(form.mcf_used) : 0,
        filters_used: form.filters_used ? Number(form.filters_used) : 0,
        antiscalant_used: form.antiscalant_used ? Number(form.antiscalant_used) : 0,
        spares_used: form.spares_used || null,
        work_done: form.work_done || null,
        remarks: form.remarks || null,
      })
      onSaved(); onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save visit')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500, maxHeight: '92vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🏫 Log Visit</h3>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>School *</label>
            <select value={form.school_id} onChange={e => set('school_id', e.target.value)}>
              <option value="">Select school…</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Visit Type</label>
            <select value={form.visit_type} onChange={e => set('visit_type', e.target.value)}>
              <option value="routine">Routine</option>
              <option value="repair">Repair</option>
              <option value="installation">Installation</option>
              <option value="complaint">Complaint</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Plant Condition</label>
            <select value={form.plant_condition} onChange={e => set('plant_condition', e.target.value)}>
              <option value="working">✅ Working</option>
              <option value="partial">⚠️ Partial</option>
              <option value="not_working">❌ Not Working</option>
            </select>
          </div>
        </div>

        {form.plant_condition !== 'working' && (
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Reason (not working / partial)</label>
            <input value={form.not_working_reason} onChange={e => set('not_working_reason', e.target.value)} placeholder="e.g. Pump failure, membrane damaged…" />
          </div>
        )}

        {/* Readings */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>Water Readings</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>TDS (ppm)</label>
            <input type="number" min="0" value={form.tds_reading} onChange={e => set('tds_reading', e.target.value)} placeholder="e.g. 150" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>pH</label>
            <input type="number" min="0" max="14" step="0.1" value={form.ph_reading} onChange={e => set('ph_reading', e.target.value)} placeholder="e.g. 7.2" />
          </div>
        </div>

        {/* Consumables */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>Consumables Used</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            ['MCF Used', 'mcf_used', 'pcs'],
            ['Filters Used', 'filters_used', 'pcs'],
            ['Antiscalant (L)', 'antiscalant_used', 'L'],
          ].map(([label, field, unit]) => (
            <div key={field} className="form-group" style={{ flex: 1, minWidth: 100 }}>
              <label>{label}</label>
              <input type="number" min="0" step="0.1" value={form[field]} onChange={e => set(field, e.target.value)} placeholder="0" />
            </div>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Spares Used</label>
          <input value={form.spares_used} onChange={e => set('spares_used', e.target.value)} placeholder="e.g. Feed pump, membrane 4040…" />
        </div>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Work Done</label>
          <input value={form.work_done} onChange={e => set('work_done', e.target.value)} placeholder="Brief description of work completed…" />
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Remarks</label>
          <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any additional notes…" />
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
            {loading ? '⏳ Saving…' : '✅ Log Visit'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function MyVisits() {
  const { user } = useAuthStore()
  const [visits, setVisits] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')
  const LIMIT = 20

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load(p = 1) {
    setLoading(true)
    api.get('/api/visits/', { params: { page: p, limit: LIMIT } })
      .then(r => { setVisits(r.data.items); setTotal(r.data.total); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load(page) }, [page])

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🏫 My Visits</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total} total</span>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setShowForm(true)}>
            + Log Visit
          </button>
        </div>
      </div>

      {loading ? <div className="spinner" /> : visits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏫</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No visits logged</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Log your school visits with water quality readings</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Log First Visit</button>
        </div>
      ) : (
        <>
          {visits.map(v => (
            <div key={v.id} style={{
              background: 'var(--surface)', borderRadius: 10, padding: 14, marginBottom: 10,
              border: `1px solid ${CONDITION_COLOR[v.plant_condition] || 'var(--border)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>🏫 {v.school_name || `School #${v.school_id}`}</div>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>📅 {v.visit_date}</span>
              </div>

              {v.plant_condition && (
                <div style={{ fontSize: 11, fontWeight: 700, color: CONDITION_COLOR[v.plant_condition], marginBottom: 6 }}>
                  {CONDITION_LABEL[v.plant_condition] || v.plant_condition}
                  {v.not_working_reason && ` — ${v.not_working_reason}`}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
                {v.tds_reading  != null && <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6 }}>💧 TDS: <b>{v.tds_reading} ppm</b></span>}
                {v.ph_reading   != null && <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6 }}>⚗️ pH: <b>{v.ph_reading}</b></span>}
                {v.mcf_used     > 0     && <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6 }}>🔧 MCF: <b>{v.mcf_used}</b></span>}
                {v.filters_used > 0     && <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6 }}>🪣 Filters: <b>{v.filters_used}</b></span>}
                {v.antiscalant_used > 0 && <span style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6 }}>🧪 Anti: <b>{v.antiscalant_used}L</b></span>}
              </div>
              {v.work_done && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>🔧 {v.work_done}</div>}
              {v.remarks   && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>💬 {v.remarks}</div>}
            </div>
          ))}

          {total > LIMIT && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
              <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>
                Page {page} of {Math.ceil(total / LIMIT)}
              </span>
              <button className="btn btn-outline" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <LogVisitModal
          employeeId={user?.id}
          onClose={() => setShowForm(false)}
          onSaved={() => { load(1); setPage(1); showToast('✅ Visit logged!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
