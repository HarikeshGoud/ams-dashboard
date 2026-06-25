import { useState, useEffect } from 'react'
import api from '../../api/axios'

const CAT_A = '50/100 LPH RO Units'
const CAT_B = '1000/1500/2000 LPH RO Units'
const CATS  = ['All', CAT_A, CAT_B, 'Other']

export default function DeskStock() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function load() {
    api.get('/api/stock/').then(r => { setItems(r.data || []); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = items.filter(i => {
    const name = (i.name || i.item_name || '').toLowerCase()
    const cat  = i.category || ''
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchCat =
      catFilter === 'All' ? true :
      catFilter === 'Other' ? (cat !== CAT_A && cat !== CAT_B) :
      cat === catFilter
    return matchSearch && matchCat
  })

  const lowStock = items.filter(i => (i.quantity || 0) <= (i.min_quantity || 0) && (i.min_quantity || 0) > 0)

  // Group filtered items by category for display
  const grouped = {}
  filtered.forEach(item => {
    const cat = item.category || 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })
  const groupOrder = [CAT_A, CAT_B, ...Object.keys(grouped).filter(c => c !== CAT_A && c !== CAT_B)]

  const catCounts = {
    All: items.length,
    [CAT_A]: items.filter(i => i.category === CAT_A).length,
    [CAT_B]: items.filter(i => i.category === CAT_B).length,
    Other: items.filter(i => i.category !== CAT_A && i.category !== CAT_B).length,
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📦 Stock Management</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ Add Item</button>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <span>⚠️</span>
          <div><b>{lowStock.length} items</b> low stock: {lowStock.slice(0, 5).map(i => i.name || i.item_name).join(', ')}{lowStock.length > 5 ? '…' : ''}</div>
        </div>
      )}

      {/* Category tab filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {CATS.map(cat => {
          const label = cat === CAT_A ? '🔵 50/100 LPH' : cat === CAT_B ? '🟢 1000–2000 LPH' : cat
          return (
            <button key={cat} onClick={() => setCatFilter(cat)} style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${catFilter === cat ? 'var(--accent)' : 'var(--border)'}`,
              background: catFilter === cat ? 'rgba(56,189,248,.15)' : 'var(--surface2)',
              color: catFilter === cat ? 'var(--accent)' : 'var(--muted)',
              whiteSpace: 'nowrap'
            }}>
              {label} ({catCounts[cat] ?? 0})
            </button>
          )
        })}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search items…" style={{ marginBottom: 14, display: 'block', width: '100%' }} />

      {loading ? <div className="spinner" /> : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No items found.</div>
      ) : (
        groupOrder.filter(cat => grouped[cat]?.length > 0).map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
              padding: '8px 12px', borderRadius: 8,
              background: cat === CAT_A ? 'rgba(56,189,248,.08)' : cat === CAT_B ? 'rgba(52,211,153,.08)' : 'var(--surface2)',
              border: `1px solid ${cat === CAT_A ? 'var(--accent)' : cat === CAT_B ? 'var(--green)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: cat === CAT_A ? 'var(--accent)' : cat === CAT_B ? 'var(--green)' : 'var(--muted)' }}>
                {cat === CAT_A ? '🔵' : cat === CAT_B ? '🟢' : '📦'} {cat}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
                {grouped[cat].length} items
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    {['#', 'Item', 'Unit', 'Unit Price', 'In Stock', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map((item, idx) => {
                    const qty    = item.quantity || 0
                    const minQty = item.min_quantity || 0
                    const isLow  = minQty > 0 && qty <= minQty
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 10px', color: 'var(--muted)', fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ padding: '9px 10px', fontWeight: 600 }}>{item.name || item.item_name}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--muted)' }}>{item.unit || 'Nos'}</td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>₹{(item.unit_price ?? item.unit_cost ?? 0).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)' }}>{qty}</span>
                          {isLow && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--red)' }}>⚠️</span>}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                            background: isLow ? 'rgba(248,113,113,.15)' : 'rgba(52,211,153,.15)',
                            color: isLow ? 'var(--red)' : 'var(--green)'
                          }}>
                            {isLow ? 'Low' : 'OK'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <button onClick={() => setAdjusting(item)} style={{
                            fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)'
                          }}>± Adjust</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onSaved={() => { load(); showToast('Stock item added!') }} />}
      {adjusting && <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { load(); showToast('Stock updated!') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function AddStockModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', category: '', unit: 'Nos', unit_price: '', min_quantity: 0, quantity: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  async function submit() {
    if (!form.name.trim()) { setError('Enter item name'); return }
    setLoading(true)
    try {
      await api.post('/api/stock/', {
        name: form.name, category: form.category, unit: form.unit,
        unit_price: Number(form.unit_price) || 0,
        min_quantity: Number(form.min_quantity) || 0,
        quantity: Number(form.quantity) || 0
      })
      onSaved(); onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Failed') }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📦 Add Stock Item</h3>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="">-- Select category --</option>
            <option value={CAT_A}>{CAT_A}</option>
            <option value={CAT_B}>{CAT_B}</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {[['name','Item Name *','text'],['unit','Unit (Nos/Ltrs/Kgs/Mtrs)','text'],['unit_price','Unit Price (₹)','number'],['min_quantity','Min Qty Alert (0 = none)','number'],['quantity','Initial Qty','number']].map(([f, label, type]) => (
          <div key={f} className="form-group" style={{ marginBottom: 10 }}>
            <label>{label}</label>
            <input type={type} value={form[f]} onChange={e => set(f, e.target.value)} />
          </div>
        ))}

        {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? '⏳…' : 'Add Item'}</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function AdjustStockModal({ item, onClose, onSaved }) {
  const [qty, setQty] = useState(0)
  const [action, setAction] = useState('add')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const delta = action === 'add' ? Number(qty) : -Number(qty)
    try {
      setLoading(true)
      await api.post(`/api/stock/${item.id}/adjust`, { quantity_change: delta, notes })
      onSaved(); onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Failed') }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>± Adjust Stock</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {item.name} · <b>₹{(item.unit_price ?? item.unit_cost ?? 0).toLocaleString('en-IN')}/{item.unit || 'Nos'}</b>
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Current stock: <b>{item.quantity || 0} {item.unit || 'Nos'}</b>
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {['add','remove'].map(a => (
            <button key={a} onClick={() => setAction(a)} style={{
              flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
              background: action === a ? (a === 'add' ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)') : 'var(--surface2)',
              border: `1.5px solid ${action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              color: action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--muted)'
            }}>{a === 'add' ? '+ Add Stock' : '- Remove Stock'}</button>
          ))}
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Quantity</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason / reference…" />
        </div>
        {error && <div className="alert alert-red" style={{ marginBottom: 10 }}><span>⚠️</span><div>{error}</div></div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? '⏳…' : 'Update Stock'}</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
