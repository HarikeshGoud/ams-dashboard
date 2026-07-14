import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

const CAT_A = '50/100 LPH RO Units'
const CAT_B = '1000/1500/2000 LPH RO Units'

export default function Billing() {
  const [invoices, setInvoices] = useState([])
  const [clients, setClients] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ client_id: '', invoice_date: new Date().toISOString().slice(0,10), due_date: '', invoice_type: 'amc', gst_percent: 18, notes: '' })
  const [lines, setLines] = useState([{ description: '', quantity: 1, unit_price: '' }])
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function f(k) { return e => setForm({ ...form, [k]: e.target.value }) }

  function load() {
    Promise.all([api.get('/api/billing/'), api.get('/api/clients/'), api.get('/api/stock/')]).then(([b, c, s]) => {
      setInvoices(b.data); setClients(c.data); setStockItems(s.data || []); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  function pickStockItem(idx, itemId) {
    if (!itemId) return
    const item = stockItems.find(s => String(s.id) === String(itemId))
    if (!item) return
    const n = [...lines]
    n[idx] = { ...n[idx], description: item.name, unit_price: item.unit_price ?? item.unit_cost ?? '' }
    setLines(n)
  }

  const subtotal = lines.reduce((a, l) => a + (parseFloat(l.unit_price) || 0) * (parseInt(l.quantity) || 0), 0)
  const gstAmt = subtotal * (parseFloat(form.gst_percent) || 18) / 100
  const total = subtotal + gstAmt

  async function save(ev) {
    ev.preventDefault()
    if (!form.client_id) { showToast('❌ Select a client'); return }
    await api.post('/api/billing/', { ...form, client_id: parseInt(form.client_id), gst_percent: parseFloat(form.gst_percent), line_items: lines.map(l => ({ description: l.description, quantity: parseInt(l.quantity), unit_price: parseFloat(l.unit_price) })) })
    load(); setModal(false); showToast('Invoice created!')
  }

  async function updateStatus(id, status) {
    await api.patch(`/api/billing/${id}/status?status=${status}`)
    load(); showToast('Status updated')
  }

  const statusPill = { draft: 'pill-gray', sent: 'pill-blue', partial: 'pill-yellow', paid: 'pill-green', overdue: 'pill-red', cancelled: 'pill-gray' }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>💰 Billing & Payments</h3>
        <button className="btn btn-green" onClick={() => setModal(true)}>+ Generate Invoice</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card green"><div className="kpi-label">Total Invoices</div><div className="kpi-value">{invoices.length}</div></div>
        <div className="kpi-card yellow"><div className="kpi-label">Pending</div><div className="kpi-value">{invoices.filter(i => ['draft','sent'].includes(i.status)).length}</div></div>
        <div className="kpi-card cyan"><div className="kpi-label">Paid</div><div className="kpi-value">{invoices.filter(i => i.status === 'paid').length}</div></div>
        <div className="kpi-card red"><div className="kpi-label">Overdue</div><div className="kpi-value">{invoices.filter(i => i.status === 'overdue').length}</div></div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice #</th><th>Client</th><th>Date</th><th>Type</th><th>Total</th><th>Paid</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent2)' }}>{inv.invoice_no}</td>
                  <td>{inv.client_name}</td>
                  <td>{inv.invoice_date}</td>
                  <td><span className="pill pill-blue">{inv.invoice_type}</span></td>
                  <td>₹{Number(inv.total_amount).toLocaleString('en-IN')}</td>
                  <td>₹{Number(inv.paid_amount).toLocaleString('en-IN')}</td>
                  <td><span className={`pill ${statusPill[inv.status] || 'pill-gray'}`}>{inv.status}</span></td>
                  <td>
                    {inv.status === 'draft' && <button className="btn btn-outline btn-sm" onClick={() => updateStatus(inv.id, 'sent')}>Send</button>}{' '}
                    {inv.status === 'sent'  && <button className="btn btn-green btn-sm" onClick={() => updateStatus(inv.id, 'paid')}>Mark Paid</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 620 }}>
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>+ Generate Invoice</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Client *</label>
                  <SearchableSelect value={form.client_id} onChange={val => setForm({ ...form, client_id: val })}
                    placeholder="Select client…" options={clients.map(c => ({ value: String(c.id), label: c.name }))} />
                </div>
                <div className="form-group"><label>Invoice Date</label><input type="date" value={form.invoice_date} onChange={f('invoice_date')} /></div>
                <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={f('due_date')} /></div>
                <div className="form-group"><label>Type</label>
                  <select value={form.invoice_type} onChange={f('invoice_type')}>
                    <option value="amc">AMC</option><option value="repair">Repair</option>
                    <option value="installation">Installation</option><option value="material">Material</option>
                  </select>
                </div>
                <div className="form-group"><label>GST %</label><input type="number" value={form.gst_percent} onChange={f('gst_percent')} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>LINE ITEMS</div>
                {lines.map((l, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: '10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {/* Grouped stock picker */}
                    <div style={{ marginBottom: 6 }}>
                      <SearchableSelect value="" onChange={val => pickStockItem(i, val)}
                        placeholder="📋 Pick from approved price list (auto-fills price)…"
                        options={stockItems.map(s => ({
                          value: String(s.id),
                          label: `[${s.category === CAT_A ? CAT_A : s.category === CAT_B ? CAT_B : 'Other'}] ${s.name} — ₹${(s.unit_price ?? s.unit_cost ?? 0).toLocaleString('en-IN')}/${s.unit}`
                        }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 30px', gap: 6 }}>
                      <input placeholder="Description (or type custom)" value={l.description}
                        onChange={e => { const n=[...lines]; n[i].description=e.target.value; setLines(n) }}
                        style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:12 }} />
                      <input type="number" placeholder="Qty" value={l.quantity}
                        onChange={e => { const n=[...lines]; n[i].quantity=e.target.value; setLines(n) }}
                        style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:12 }} />
                      <input type="number" placeholder="Unit Price ₹" value={l.unit_price}
                        onChange={e => { const n=[...lines]; n[i].unit_price=e.target.value; setLines(n) }}
                        style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:12 }} />
                      <button type="button" onClick={() => setLines(lines.filter((_,j)=>j!==i))}
                        style={{ background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16 }}>×</button>
                    </div>
                    {l.description && l.unit_price && (
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                        Line total: ₹{((parseFloat(l.unit_price)||0) * (parseInt(l.quantity)||0)).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setLines([...lines, { description:'',quantity:1,unit_price:'' }])}>+ Add Line</button>
                <div style={{ marginTop: 12, textAlign: 'right', fontSize: 13 }}>
                  <div>Subtotal: <b>₹{subtotal.toFixed(2)}</b></div>
                  <div>GST ({form.gst_percent}%): <b>₹{gstAmt.toFixed(2)}</b></div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent2)' }}>Total: ₹{total.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">Create Invoice</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
