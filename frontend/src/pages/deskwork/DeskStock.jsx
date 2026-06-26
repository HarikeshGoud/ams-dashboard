import { useState, useEffect } from 'react'
import api from '../../api/axios'

export default function DeskStock() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    api.get('/api/stock/')
      .then(r => { setItems(r.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = items.filter(i =>
    !search || (i.name || i.item_name || '').toLowerCase().includes(search.toLowerCase())
  )
  const lowStock = items.filter(i => (i.quantity || 0) <= (i.min_quantity || 5))

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📦 Stock Management</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ Add Stock</button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search stock items…"
        style={{ marginBottom: 14, display: 'block', width: '100%', fontSize: 15, padding: '12px 16px' }} />

      {loading ? <div className="spinner" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                {['Item', 'Category', 'Qty', 'Unit', 'Unit Price', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const qty = item.quantity || 0
                const minQty = item.min_quantity || 5
                const isLow = qty <= minQty
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600 }}>{item.name || item.item_name}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--muted)' }}>{item.category || '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)' }}>{qty}</span>
                      {isLow && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--red)' }}>⚠️LOW</span>}
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--muted)' }}>{item.unit || 'pcs'}</td>
                    <td style={{ padding: '10px 10px' }}>₹{(item.unit_price || item.price || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                        background: isLow ? 'rgba(248,113,113,.15)' : 'rgba(52,211,153,.15)',
                        color: isLow ? 'var(--red)' : 'var(--green)' }}>
                        {isLow ? 'Low Stock' : 'OK'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
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
      )}

      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onSaved={() => { load(); showToast('✅ Stock item added!') }} />}
      {adjusting && <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { load(); showToast('✅ Stock updated!') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function AddStockModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', category: '', unit: 'pcs', unit_price: '', min_quantity: 5, quantity: 0 })
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
        min_quantity: Number(form.min_quantity) || 5,
        quantity: Number(form.quantity) || 0
      })
      onSaved(); onClose()
    } catch (e) { setError(e.response?.data?.detail || 'Failed') }
    setLoading(false)
  }
  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📦 Add Stock Item</h3>
        {[['name','Item Name *','text'],['category','Category','text'],['unit','Unit','text'],['unit_price','Unit Price (₹)','number'],['min_quantity','Min Qty Alert','number'],['quantity','Initial Qty','number']].map(([f, label, type]) => (
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
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          {item.name || item.item_name} · Current: <b>{item.quantity || 0} {item.unit || 'pcs'}</b>
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
