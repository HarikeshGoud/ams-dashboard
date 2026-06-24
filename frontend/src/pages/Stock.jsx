import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Stock() {
  const [items, setItems] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'add-item' | 'receive' | 'transfer' | 'issue'
  const [itemForm, setItemForm] = useState({ name: '', category: '', unit: 'pcs', min_qty: 5, unit_cost: 0 })
  const [ledgerForm, setLedgerForm] = useState({ item_id: '', quantity: 1, person: '', buy_price: '', logistics1: '', logistics2: '', school_dest: '', note: '' })
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([api.get('/api/stock/items'), api.get('/api/stock/ledger')]).then(([it, lg]) => {
      setItems(it.data); setLedger(lg.data); setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function saveItem(ev) {
    ev.preventDefault()
    await api.post('/api/stock/items', { ...itemForm, min_qty: parseInt(itemForm.min_qty), unit_cost: parseFloat(itemForm.unit_cost) || 0 })
    load(); setModal(null); showToast('Item added!')
  }

  async function saveLedger(ev) {
    ev.preventDefault()
    await api.post('/api/stock/ledger', {
      ...ledgerForm, item_id: parseInt(ledgerForm.item_id), quantity: parseInt(ledgerForm.quantity),
      buy_price: parseFloat(ledgerForm.buy_price) || null,
      logistics1: parseFloat(ledgerForm.logistics1) || null,
      logistics2: parseFloat(ledgerForm.logistics2) || null,
      transaction_type: modal
    })
    load(); setModal(null); showToast('Saved!')
  }

  async function delLedger(id) {
    if (!confirm('Delete entry?')) return
    await api.delete(`/api/stock/ledger/${id}`)
    load(); showToast('Deleted')
  }

  if (loading) return <div className="spinner" />

  const lowStock = items.filter(i => i.office_qty <= i.min_qty)

  return (
    <div>
      <div className="section-header">
        <h3>📦 Stock & Materials</h3>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-green"   onClick={() => setModal('receive')}>+ Receive</button>
          <button className="btn btn-primary" onClick={() => setModal('transfer')}>→ Transfer</button>
          <button className="btn btn-outline" onClick={() => setModal('issue')}>↑ Issue</button>
          <button className="btn btn-outline" onClick={() => setModal('add-item')}>+ New Item</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card red"><div className="kpi-label">Low Stock</div><div className="kpi-value">{lowStock.length}</div><div className="kpi-sub">Items below threshold</div></div>
        <div className="kpi-card yellow"><div className="kpi-label">Items Tracked</div><div className="kpi-value">{items.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Current Inventory</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Unit</th><th>Office Qty</th><th>Min Qty</th><th>Cost/Unit</th><th>Status</th></tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500 }}>{i.name}</td>
                  <td>{i.unit}</td>
                  <td>{i.office_qty}</td>
                  <td>{i.min_qty}</td>
                  <td>₹{i.unit_cost}</td>
                  <td><span className={`pill ${i.office_qty <= i.min_qty ? 'pill-red' : 'pill-green'}`}>{i.office_qty <= i.min_qty ? 'Low' : 'OK'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Stock Ledger</div>
        <div className="table-wrap scroll-table" style={{ maxHeight: 400 }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>Person</th><th>Buy Price</th><th>Note</th><th>Del</th></tr>
            </thead>
            <tbody>
              {ledger.map(e => (
                <tr key={e.id}>
                  <td>{e.created_at?.slice(0,10)}</td>
                  <td><span className={`pill ${e.transaction_type === 'receive' ? 'pill-green' : e.transaction_type === 'transfer' ? 'pill-blue' : 'pill-orange'}`}>{e.transaction_type}</span></td>
                  <td>{e.item_name}</td>
                  <td>{e.quantity}</td>
                  <td>{e.person || '—'}</td>
                  <td>{e.buy_price ? `₹${e.buy_price}` : '—'}</td>
                  <td>{e.note || '—'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => delLedger(e.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'add-item' && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ New Stock Item</h3>
            <form onSubmit={saveItem}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Name *</label><input required value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} /></div>
                <div className="form-group"><label>Category</label><input value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})} /></div>
                <div className="form-group"><label>Unit</label><input value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})} /></div>
                <div className="form-group"><label>Min Qty</label><input type="number" value={itemForm.min_qty} onChange={e => setItemForm({...itemForm, min_qty: e.target.value})} /></div>
                <div className="form-group"><label>Cost/Unit (₹)</label><input type="number" value={itemForm.unit_cost} onChange={e => setItemForm({...itemForm, unit_cost: e.target.value})} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {['receive','transfer','issue'].includes(modal) && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, textTransform: 'capitalize' }}>{modal} Stock</h3>
            <form onSubmit={saveLedger}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Item *</label>
                  <select required value={ledgerForm.item_id} onChange={e => setLedgerForm({...ledgerForm, item_id: e.target.value})}>
                    <option value="">Select item...</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name} (qty: {i.office_qty})</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Quantity *</label><input required type="number" min="1" value={ledgerForm.quantity} onChange={e => setLedgerForm({...ledgerForm, quantity: e.target.value})} /></div>
                <div className="form-group"><label>{modal === 'receive' ? 'Seller' : 'Person'}</label><input value={ledgerForm.person} onChange={e => setLedgerForm({...ledgerForm, person: e.target.value})} /></div>
                {modal === 'receive' && <>
                  <div className="form-group"><label>Buy Price (₹)</label><input type="number" value={ledgerForm.buy_price} onChange={e => setLedgerForm({...ledgerForm, buy_price: e.target.value})} /></div>
                  <div className="form-group"><label>Logistics 1 (Mfr→Office)</label><input type="number" value={ledgerForm.logistics1} onChange={e => setLedgerForm({...ledgerForm, logistics1: e.target.value})} /></div>
                  <div className="form-group"><label>Logistics 2 (Office→Tech)</label><input type="number" value={ledgerForm.logistics2} onChange={e => setLedgerForm({...ledgerForm, logistics2: e.target.value})} /></div>
                </>}
                {modal === 'issue' && <div className="form-group form-full"><label>School / Dest.</label><input value={ledgerForm.school_dest} onChange={e => setLedgerForm({...ledgerForm, school_dest: e.target.value})} /></div>}
                <div className="form-group form-full"><label>Note</label><input value={ledgerForm.note} onChange={e => setLedgerForm({...ledgerForm, note: e.target.value})} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Submit</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
