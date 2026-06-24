import { useState, useEffect } from 'react'
import api from '../../api/axios'

const STATUS_CFG = {
  submitted: { label: '⏳ Submitted',  color: 'var(--yellow)', bg: 'rgba(251,191,36,.1)' },
  approved:  { label: '✅ Approved',   color: 'var(--green)',  bg: 'rgba(52,211,153,.1)' },
  paid:      { label: '💰 Paid',       color: 'var(--green)',  bg: 'rgba(52,211,153,.15)' },
  rejected:  { label: '❌ Rejected',   color: 'var(--red)',    bg: 'rgba(248,113,113,.1)' },
  draft:     { label: '📝 Draft',      color: 'var(--muted)',  bg: 'var(--surface2)' },
}

function GenerateBillModal({ onClose, onCreated }) {
  const [schoolName, setSchoolName] = useState('')
  const [schools, setSchools] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [lines, setLines] = useState([{ description: '', quantity: 1, unit_price: 0 }])
  const [notes, setNotes] = useState('')
  const [gst, setGst] = useState(18)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    Promise.all([
      api.get('/api/schools/?limit=200').catch(() => ({ data: { items: [] } })),
      api.get('/api/stock/').catch(() => ({ data: [] }))
    ]).then(([s, st]) => {
      setSchools(s.data?.items || s.data || [])
      setStockItems(st.data || [])
    })
  }, [])

  function setLine(i, field, val) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }

  function pickStock(i, stockId) {
    const item = stockItems.find(s => String(s.id) === String(stockId))
    if (item) setLines(prev => prev.map((l, idx) => idx === i
      ? { ...l, description: item.name || item.item_name, unit_price: item.unit_price || item.price || 0 }
      : l))
  }

  function addLine() { setLines(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }]) }
  function removeLine(i) { setLines(prev => prev.filter((_, idx) => idx !== i)) }

  const subtotal = lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0)
  const gstAmt   = subtotal * gst / 100
  const total    = subtotal + gstAmt

  async function submit() {
    if (!schoolName.trim()) { setError('Enter school/location name'); return }
    if (lines.every(l => !l.description.trim())) { setError('Add at least one item'); return }
    const validLines = lines.filter(l => l.description.trim())
    setLoading(true); setError('')
    try {
      await api.post('/api/billing/work-bill', {
        school_name: schoolName,
        invoice_date: today,
        gst_percent: gst,
        notes,
        line_items: validLines.map(l => ({
          description: l.description,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price)
        }))
      })
      onCreated()
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to generate bill')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🧾 Generate Work Bill</h3>

        {/* School / Location */}
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>School / Location *</label>
          {schools.length > 0 ? (
            <select value={schoolName} onChange={e => setSchoolName(e.target.value)}>
              <option value="">Select school…</option>
              {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              <option value="__other__">Other (type below)</option>
            </select>
          ) : null}
          {(schools.length === 0 || schoolName === '__other__') && (
            <input value={schoolName === '__other__' ? '' : schoolName}
              onChange={e => setSchoolName(e.target.value)}
              placeholder="Type school or location name…"
              style={{ marginTop: schools.length > 0 ? 6 : 0 }} />
          )}
        </div>

        {/* Line items */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            Items Installed / Work Done
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              {/* Pick from stock */}
              {stockItems.length > 0 && (
                <select onChange={e => pickStock(i, e.target.value)} defaultValue=""
                  style={{ marginBottom: 6, fontSize: 12 }}>
                  <option value="">Pick from stock…</option>
                  {stockItems.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.item_name} — ₹{s.unit_price || s.price || 0}
                    </option>
                  ))}
                </select>
              )}
              <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)}
                placeholder="Item / work description" style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Qty</label>
                  <input type="number" min="1" value={line.quantity}
                    onChange={e => setLine(i, 'quantity', e.target.value)} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Unit Price (₹)</label>
                  <input type="number" min="0" value={line.unit_price}
                    onChange={e => setLine(i, 'unit_price', e.target.value)} />
                </div>
                <div style={{ flex: 1, paddingTop: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)' }}>
                    ₹{(line.quantity * line.unit_price).toLocaleString('en-IN')}
                  </div>
                </div>
                {lines.length > 1 && (
                  <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, paddingTop: 18 }}>✕</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addLine} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px dashed var(--accent)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
            + Add Item
          </button>
        </div>

        {/* GST + Notes */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>GST %</label>
            <input type="number" value={gst} onChange={e => setGst(+e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks…" />
          </div>
        </div>

        {/* Totals */}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>Subtotal</span>
            <span>₹{subtotal.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--muted)' }}>GST ({gst}%)</span>
            <span>₹{gstAmt.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
            <span>Total</span>
            <span style={{ color: 'var(--accent2)' }}>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
            {loading ? '⏳ Generating…' : '🧾 Generate & Submit Bill'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function MyBilling() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    api.get('/api/billing/')
      .then(r => { setBills(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totalBilled = bills.reduce((s, b) => s + b.total_amount, 0)
  const totalPaid   = bills.reduce((s, b) => s + b.paid_amount, 0)

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🧾 My Work Bills</h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => setShowForm(true)}>
          + Generate Bill
        </button>
      </div>

      {bills.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            ['📋 Total Bills', bills.length,                               'var(--accent)'],
            ['💸 Billed',      `₹${totalBilled.toLocaleString('en-IN')}`, 'var(--yellow)'],
            ['✅ Paid',        `₹${totalPaid.toLocaleString('en-IN')}`,   'var(--green)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="spinner" /> : bills.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No bills yet</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Generate a bill after completing work at a school</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Generate First Bill</button>
        </div>
      ) : (
        bills.map(b => {
          const sc = STATUS_CFG[b.status] || STATUS_CFG.draft
          return (
            <div key={b.id} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{b.invoice_no}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    🏫 {b.school_name || b.client_name || '—'} &nbsp;·&nbsp; 📅 {b.invoice_date}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 8, background: sc.bg, color: sc.color, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                  {sc.label}
                </span>
              </div>

              {b.line_items?.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                  {b.line_items.map((li, i) => (
                    <div key={i}>• {li.description} × {li.quantity} = ₹{li.total.toLocaleString('en-IN')}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Subtotal ₹{b.subtotal.toLocaleString('en-IN')} + GST ₹{b.gst_amount.toFixed(0)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent2)' }}>
                  ₹{b.total_amount.toLocaleString('en-IN')}
                </div>
              </div>
              {b.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>💬 {b.notes}</div>}
            </div>
          )
        })
      )}

      {showForm && (
        <GenerateBillModal
          onClose={() => setShowForm(false)}
          onCreated={() => { load(); showToast('✅ Bill generated and submitted to admin!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
