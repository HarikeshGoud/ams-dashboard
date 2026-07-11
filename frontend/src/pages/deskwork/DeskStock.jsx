import { useState, useEffect } from 'react'
import api from '../../api/axios'

const CAT_A = '50/100 LPH RO Units'
const CAT_B = '1000/1500/2000 LPH RO Units'

export default function DeskStock() {
  const [items, setItems]           = useState([])
  const [employees, setEmployees]   = useState([])
  const [distributions, setDist]    = useState([])
  const [empStock, setEmpStock]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [tab, setTab]               = useState('inventory')   // inventory | distribute | emp-stock
  const [showAdd, setShowAdd]       = useState(false)
  const [adjusting, setAdjusting]   = useState(null)
  const [distModal, setDistModal]   = useState(false)
  const [distForm, setDistForm]     = useState({ item_id: '', employee_id: '', quantity: 1, note: '' })
  const [ledger, setLedger]         = useState([])
  const [expandedTech, setExpandedTech] = useState(null)
  const [toast, setToast]           = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([
      api.get('/api/stock/'),
      api.get('/api/employees/'),
      api.get('/api/stock/distributions'),
      api.get('/api/stock/employee-stock'),
      api.get('/api/stock/ledger'),
    ]).then(([it, emp, dist, es, lg]) => {
      setItems(it.data || [])
      setEmployees(emp.data || [])
      setDist(dist.data || [])
      setEmpStock(es.data || [])
      setLedger(lg.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function distribute(ev) {
    ev.preventDefault()
    try {
      await api.post('/api/stock/distribute', {
        item_id: parseInt(distForm.item_id),
        employee_id: parseInt(distForm.employee_id),
        quantity: parseInt(distForm.quantity),
        note: distForm.note || null
      })
      showToast('✅ Stock distributed to technician!')
      setDistModal(false); load()
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

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

  const selectedItem = items.find(i => i.id === parseInt(distForm.item_id))

  // Build per-technician usage summary
  const techMap = {}
  empStock.forEach(emp => {
    techMap[emp.employee_id] = {
      id: emp.employee_id, name: emp.employee_name,
      stockItems: emp.items,
      totalInHand: emp.items.reduce((s, i) => s + (i.qty_in_hand || 0), 0),
      totalDistributed: 0, totalInstalled: 0, totalReturned: 0, distHistory: [],
    }
  })
  distributions.forEach(d => {
    if (!techMap[d.employee_id]) {
      techMap[d.employee_id] = { id: d.employee_id, name: d.employee_name || d.person, stockItems: [], totalInHand: 0, totalDistributed: 0, totalInstalled: 0, totalReturned: 0, distHistory: [] }
    }
    techMap[d.employee_id].totalDistributed += (d.quantity || 0)
    techMap[d.employee_id].distHistory.push(d)
  })
  ledger.forEach(e => {
    if (!e.employee_id || !techMap[e.employee_id]) return
    if (e.transaction_type === 'install') techMap[e.employee_id].totalInstalled += (e.quantity || 0)
    if (e.transaction_type === 'return')  techMap[e.employee_id].totalReturned  += (e.quantity || 0)
  })
  const techList = Object.values(techMap)

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📦 Stock Management</h3>
        <div className="flex gap-8">
          <button className="btn btn-purple" style={{ fontSize: 12 }} onClick={() => { setDistModal(true); setDistForm({ item_id: '', employee_id: '', quantity: 1, note: '' }) }}>📤 Distribute to Tech</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ Add Item</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'inventory',  label: '📦 Inventory' },
          { key: 'distribute', label: '📤 Distribute' },
          { key: 'emp-stock',  label: `👁 Usage Monitor${techList.length ? ` (${techList.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
            background: tab === t.key ? 'var(--accent)' : 'var(--surface)', color: tab === t.key ? '#fff' : 'var(--text)'
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── DISTRIBUTE TAB ── */}
      {tab === 'distribute' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Distribution History</div>
            <button className="btn btn-purple btn-sm" onClick={() => { setDistModal(true); setDistForm({ item_id: '', employee_id: '', quantity: 1, note: '' }) }}>+ Distribute</button>
          </div>
          {distributions.length === 0 ? (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No distributions yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Technician</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{d.created_at?.slice(0, 10)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.item_name}</td>
                      <td style={{ padding: '8px 10px' }}><b>{d.quantity}</b> {d.item_unit}</td>
                      <td style={{ padding: '8px 10px' }}>{d.employee_name || d.person || '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{d.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── USAGE MONITOR TAB ── */}
      {tab === 'emp-stock' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            👁 Per-technician stock usage — what was distributed, what they hold, what they installed, what they returned.
          </div>
          {techList.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No stock distributed to technicians yet</div>
          ) : techList.map(tech => {
            const isExpanded = expandedTech === tech.id
            return (
              <div key={tech.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setExpandedTech(isExpanded ? null : tech.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>👷</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{tech.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{tech.stockItems.length} item type{tech.stockItems.length !== 1 ? 's' : ''} in hand</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Distributed', value: tech.totalDistributed, color: 'var(--accent2)' },
                      { label: 'In Hand', value: tech.totalInHand, color: 'var(--yellow)' },
                      { label: 'Installed', value: tech.totalInstalled, color: 'var(--green)' },
                      { label: 'Returned', value: tech.totalReturned, color: 'var(--blue, #60a5fa)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', minWidth: 52 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{s.label}</div>
                      </div>
                    ))}
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {tech.stockItems.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', marginBottom: 6 }}>🎒 Currently In Hand</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10 }}>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Qty</th>
                          </tr></thead>
                          <tbody>
                            {tech.stockItems.map(it => (
                              <tr key={it.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{it.item_name}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--accent2)' }}>{it.qty_in_hand} {it.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {tech.distHistory.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>📦 Distributions Received</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10 }}>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Qty</th>
                          </tr></thead>
                          <tbody>
                            {tech.distHistory.map(d => (
                              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px', fontSize: 11 }}>{d.created_at?.slice(0, 10)}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{d.item_name}</td>
                                <td style={{ padding: '6px 8px' }}><b>{d.quantity}</b> {d.item_unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {(() => {
                      const techLedger = ledger.filter(e => e.employee_id === tech.id && ['install','return'].includes(e.transaction_type))
                      if (!techLedger.length) return null
                      return (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>🔧 Install & Return Activity</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10 }}>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Action</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Qty</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left' }}>School / Note</th>
                            </tr></thead>
                            <tbody>
                              {techLedger.map(e => (
                                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 8px', fontSize: 11 }}>{e.created_at?.slice(0, 10)}</td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                                      background: e.transaction_type === 'install' ? 'rgba(52,211,153,.15)' : 'rgba(96,165,250,.15)',
                                      color: e.transaction_type === 'install' ? 'var(--green)' : 'var(--blue, #60a5fa)' }}>
                                      {e.transaction_type === 'install' ? '🔧 Installed' : '↩ Returned'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{e.item_name}</td>
                                  <td style={{ padding: '6px 8px' }}><b>{e.quantity}</b></td>
                                  <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)' }}>{e.school_dest || e.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── INVENTORY TAB ── */}
      {tab === 'inventory' && <>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search stock items…"
        style={{ marginBottom: 14, display: 'block', width: '100%', fontSize: 15, padding: '12px 16px' }} />

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

      </>}

      {showAdd && <AddStockModal onClose={() => setShowAdd(false)} onSaved={() => { load(); showToast('Stock item added!') }} />}
      {adjusting && <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { load(); showToast('Stock updated!') }} />}

      {/* Distribute Modal */}
      {distModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <button className="modal-close" onClick={() => setDistModal(false)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📤 Distribute Stock to Technician</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Deducts from office stock and adds to technician's personal inventory.</p>
            <form onSubmit={distribute}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Item *</label>
                <select required value={distForm.item_id} onChange={e => setDistForm({...distForm, item_id: e.target.value})}>
                  <option value="">Select item...</option>
                  {items.filter(i => (i.office_qty || i.quantity || 0) > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {i.office_qty || i.quantity} {i.unit} in office</option>
                  ))}
                </select>
              </div>
              {selectedItem && (
                <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                  Office stock: <b style={{ color: 'var(--accent2)' }}>{selectedItem.office_qty || selectedItem.quantity} {selectedItem.unit}</b>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Technician *</label>
                <select required value={distForm.employee_id} onChange={e => setDistForm({...distForm, employee_id: e.target.value})}>
                  <option value="">Select technician...</option>
                  {employees.filter(e => e.role === 'technician').map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.employee_code || 'no code'})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Quantity *</label>
                  <input required type="number" min="1" max={selectedItem?.office_qty || selectedItem?.quantity || 9999} value={distForm.quantity}
                    onChange={e => setDistForm({...distForm, quantity: e.target.value})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Note</label>
                  <input value={distForm.note} onChange={e => setDistForm({...distForm, note: e.target.value})} placeholder="Optional..." />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-purple" style={{ flex: 1 }}>📤 Distribute</button>
                <button type="button" className="btn btn-outline" onClick={() => setDistModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
