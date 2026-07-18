import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'
import { sendReorderSummaryWhatsApp } from '../utils/reorderSummary'
import { formatISTDate } from '../utils/istTime'

const CAT_A = '50/100 LPH RO Units'
const CAT_B = '1000/1500/2000 LPH RO Units'
// Matches the exact category strings actually in use in the data — picking one here
// should never create a new, slightly-different-spelled category by accident.
const STOCK_CATEGORIES = [CAT_A, CAT_B, 'ATW Parts', 'Consumables', 'Electrical', 'Filter', 'Fittings', 'Membranes', 'Pumps', 'Chemical', 'Housings', 'UV', 'Other']
const TYPE_COLOR = { receive: 'pill-green', transfer: 'pill-blue', issue: 'pill-orange', distribute: 'pill-purple', return: 'pill-yellow', install: 'pill-red', purchase: 'pill-blue' }
const TYPE_LABEL = { receive: '⬇ Receive', transfer: '↔ Transfer', issue: '↑ Issue', distribute: '📦 Distribute', return: '↩ Return', install: '🔧 Install', purchase: '🛒 Purchase' }

function batchLabel(b) {
  return `${b.batch_no} — ${b.qty_office} left (received ${b.received_date})`
}

export default function Stock() {
  const [items, setItems]             = useState([])
  const [ledger, setLedger]           = useState([])
  const [distributions, setDist]      = useState([])
  const [empStock, setEmpStock]       = useState([])
  const [employees, setEmployees]     = useState([])
  const [schools, setSchools]         = useState([])
  const [purchases, setPurchases]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [tab, setTab]                 = useState('inventory')   // inventory | ledger | distribute | emp-stock | purchases
  const [expandedTech, setExpandedTech] = useState(null)
  const [techProofs, setTechProofs]     = useState({})   // { [emp_id]: reports[] }
  const [lightbox, setLightbox]         = useState(null) // url string
  const [expandedPurchase, setExpandedPurchase] = useState(null)
  const [purchaseNotes, setPurchaseNotes]       = useState({})
  const [modal, setModal]             = useState(null)
  const [editItem, setEditItem]       = useState(null)
  const [adjusting, setAdjusting]     = useState(null)
  const [itemForm, setItemForm]       = useState({ name: '', category: '', unit: 'pcs', min_qty: 5, unit_cost: 0 })
  const [ledgerForm, setLedgerForm]   = useState({ item_id: '', batch_id: '', quantity: 1, person: '', buy_price: '', logistics1: '', logistics2: '', school_dest: '', note: '' })
  const [distForm, setDistForm]       = useState({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' })
  const [ledgerBatches, setLedgerBatches] = useState([])
  const [distBatches, setDistBatches]     = useState([])
  const [lookupItem, setLookupItem]       = useState('')
  const [lookupBatches, setLookupBatches] = useState([])
  const [lookupTrace, setLookupTrace]     = useState(null)
  const [reorders, setReorders]           = useState([])
  const [reorderModal, setReorderModal]   = useState(null) // item being requested
  const [reorderForm, setReorderForm]     = useState({ quantity: 1, note: '' })
  const [receiveModal, setReceiveModal]   = useState(null) // reorder request being marked received
  const [receiveForm, setReceiveForm]     = useState({ quantity: 1, buy_price: '', person: '' })
  const [accounts, setAccounts]           = useState({ batches: [], monthly: [], grand_total: 0 })
  const [toast, setToast]             = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([
      api.get('/api/stock/items'),
      api.get('/api/stock/ledger'),
      api.get('/api/stock/distributions'),
      api.get('/api/stock/employee-stock'),
      api.get('/api/employees/'),
      api.get('/api/schools/?limit=200'),
      api.get('/api/stock-purchases/'),
      api.get('/api/reorder/'),
      api.get('/api/stock/accounts'),
    ]).then(([it, lg, dist, es, emp, sch, pu, ro, ac]) => {
      setItems(it.data)
      setLedger(lg.data)
      setDist(dist.data)
      setEmpStock(es.data)
      setEmployees(emp.data || [])
      setSchools(sch.data?.items || sch.data || [])
      setPurchases(pu.data || [])
      setReorders(ro.data || [])
      setAccounts(ac.data || { batches: [], monthly: [], grand_total: 0 })
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  async function requestReorder(ev) {
    ev.preventDefault()
    try {
      await api.post('/api/reorder/', {
        item_id: reorderModal.id, requested_qty: parseInt(reorderForm.quantity), note: reorderForm.note || null
      })
      setReorderModal(null); load(); showToast('✅ Reorder requested')
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  async function updateReorder(id, status) {
    try {
      await api.patch(`/api/reorder/${id}`, { status })
      load(); showToast(`Marked as ${status}`)
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  async function confirmReceive(ev) {
    ev.preventDefault()
    try {
      await api.patch(`/api/reorder/${receiveModal.id}`, {
        status: 'received',
        received_qty: parseInt(receiveForm.quantity),
        buy_price: parseFloat(receiveForm.buy_price) || null,
        person: receiveForm.person || null,
      })
      setReceiveModal(null); load(); showToast('✅ Stock received — added to office inventory as a new batch')
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  async function reviewPurchase(id, status, note = '') {
    await api.patch(`/api/stock-purchases/${id}`, { status, admin_note: note || null })
    setExpandedPurchase(null)
    load()
    showToast(status === 'approved' ? '✅ Purchase approved' : '❌ Purchase rejected')
  }

  async function repayPurchase(id, note = '') {
    await api.patch(`/api/stock-purchases/${id}/repay`, { method: 'paid_separately', note: note || null })
    setExpandedPurchase(null)
    load()
    showToast('💰 Marked as repaid')
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (modal === 'issue' && ledgerForm.item_id) {
      api.get('/api/stock/batches', { params: { item_id: ledgerForm.item_id } }).then(r => {
        setLedgerBatches(r.data)
        if (r.data.length === 1) setLedgerForm(f => ({ ...f, batch_id: String(r.data[0].id) }))
      })
    } else { setLedgerBatches([]) }
  }, [modal, ledgerForm.item_id])

  useEffect(() => {
    if (modal === 'distribute' && distForm.item_id) {
      api.get('/api/stock/batches', { params: { item_id: distForm.item_id } }).then(r => {
        setDistBatches(r.data)
        if (r.data.length === 1) setDistForm(f => ({ ...f, batch_id: String(r.data[0].id) }))
      })
    } else { setDistBatches([]) }
  }, [modal, distForm.item_id])

  useEffect(() => {
    if (lookupItem) {
      api.get('/api/stock/batches', { params: { item_id: lookupItem, include_depleted: true } }).then(r => setLookupBatches(r.data))
      setLookupTrace(null)
    } else { setLookupBatches([]); setLookupTrace(null) }
  }, [lookupItem])

  async function openTrace(batchId) {
    const r = await api.get(`/api/stock/batches/${batchId}/trace`)
    setLookupTrace(r.data)
  }

  async function saveItem(ev) {
    ev.preventDefault()
    const payload = { ...itemForm, min_qty: parseInt(itemForm.min_qty), unit_cost: parseFloat(itemForm.unit_cost) || 0 }
    try {
      if (editItem) { await api.put(`/api/stock/items/${editItem.id}`, payload); showToast('Item updated!') }
      else { await api.post('/api/stock/items', payload); showToast('Item added!') }
      load(); setModal(null); setEditItem(null)
    } catch (e) { showToast('Error: ' + (e.response?.data?.detail || e.message)) }
  }

  function openEdit(item) {
    setEditItem(item)
    setItemForm({ name: item.name, category: item.category || '', unit: item.unit, min_qty: item.min_qty, unit_cost: item.unit_cost })
    setModal('edit-item')
  }

  async function saveLedger(ev) {
    ev.preventDefault()
    if (!ledgerForm.item_id) { showToast('❌ Select an item'); return }
    if (modal === 'issue' && !ledgerForm.batch_id) { showToast('❌ Select which batch this is being issued from'); return }
    try {
      await api.post('/api/stock/ledger', {
        ...ledgerForm, item_id: parseInt(ledgerForm.item_id), quantity: parseInt(ledgerForm.quantity),
        batch_id: ledgerForm.batch_id ? parseInt(ledgerForm.batch_id) : null,
        buy_price: parseFloat(ledgerForm.buy_price) || null,
        logistics1: parseFloat(ledgerForm.logistics1) || null,
        logistics2: parseFloat(ledgerForm.logistics2) || null,
        transaction_type: modal
      })
      load(); setModal(null); showToast('Saved!')
    } catch (e) { showToast('Error: ' + (e.response?.data?.detail || e.message)) }
  }

  async function distribute(ev) {
    ev.preventDefault()
    if (!distForm.item_id || !distForm.employee_id) { showToast('❌ Select an item and technician'); return }
    if (!distForm.batch_id) { showToast('❌ Select which batch to distribute from'); return }
    try {
      await api.post('/api/stock/distribute', {
        item_id: parseInt(distForm.item_id),
        batch_id: parseInt(distForm.batch_id),
        employee_id: parseInt(distForm.employee_id),
        quantity: parseInt(distForm.quantity),
        note: distForm.note || null
      })
      load(); setModal(null); showToast('✅ Stock distributed!')
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  async function delLedger(id) {
    if (!confirm('Delete entry? This will reverse the qty change.')) return
    await api.delete(`/api/stock/ledger/${id}`)
    load(); showToast('Deleted')
  }

  async function toggleTech(techId) {
    if (expandedTech === techId) { setExpandedTech(null); return }
    setExpandedTech(techId)
    if (!techProofs[techId]) {
      try {
        const res = await api.get(`/api/field-reports/employee/${techId}`)
        setTechProofs(prev => ({ ...prev, [techId]: res.data || [] }))
      } catch { setTechProofs(prev => ({ ...prev, [techId]: [] })) }
    }
  }

  if (loading) return <div className="spinner" />

  const lowStock = items.filter(i => i.min_qty > 0 && i.office_qty <= i.min_qty)
  const selectedItem = items.find(i => i.id === parseInt(distForm.item_id))
  const selectedDistBatch = distBatches.find(b => b.id === parseInt(distForm.batch_id))
  const selectedLedgerBatch = ledgerBatches.find(b => b.id === parseInt(ledgerForm.batch_id))

  const filteredItems = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  const grouped = {}
  filteredItems.forEach(item => {
    const cat = item.category || 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })
  const groupOrder = [CAT_A, CAT_B, ...Object.keys(grouped).filter(c => c !== CAT_A && c !== CAT_B)]

  // Build per-technician usage summary
  const techMap = {}
  empStock.forEach(emp => {
    techMap[emp.employee_id] = {
      id: emp.employee_id,
      name: emp.employee_name,
      stockItems: emp.items,
      totalInHand: emp.items.reduce((s, i) => s + (i.qty_in_hand || 0), 0),
      totalDistributed: 0,
      totalInstalled: 0,
      totalReturned: 0,
      distHistory: [],
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

  const pendingPurchases = purchases.filter(p => p.status === 'pending')

  const openReorders = reorders.filter(r => r.status === 'pending' || r.status === 'ordered')
  const openReorderItemIds = new Set(openReorders.map(r => r.item_id))
  const needsReorder = items.filter(i => i.min_qty > 0 && i.office_qty <= i.min_qty && !openReorderItemIds.has(i.id))
  const resolvedReorders = reorders.filter(r => r.status === 'received' || r.status === 'cancelled').slice(0, 20)

  const TABS = [
    { key: 'inventory',  label: '📦 Inventory' },
    { key: 'distribute', label: '📤 Distribute' },
    { key: 'emp-stock',  label: `👁 Usage Monitor${techList.length ? ` (${techList.length})` : ''}` },
    { key: 'purchases',  label: `🛒 Purchased Stock${pendingPurchases.length ? ` (${pendingPurchases.length})` : ''}` },
    { key: 'ledger',     label: '📋 Ledger' },
    { key: 'batches',    label: '🔍 Batch Lookup' },
    { key: 'reorder',    label: `🔄 Reorder${needsReorder.length + openReorders.length ? ` (${needsReorder.length + openReorders.length})` : ''}` },
    { key: 'accounts',   label: '💰 Accounts' },
  ]

  return (
    <div>
      <div className="section-header">
        <h3>📦 Stock & Materials</h3>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-green"   onClick={() => setModal('receive')}>⬇ Receive</button>
          <button className="btn btn-outline" onClick={() => setModal('issue')}>↑ Issue</button>
          <button className="btn btn-purple"  onClick={() => { setModal('distribute'); setDistForm({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' }) }}>📤 Distribute to Tech</button>
          <button className="btn btn-outline" onClick={() => setModal('add-item')}>+ New Item</button>
        </div>
      </div>

      {/* KPI */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card red"><div className="kpi-label">Low Stock</div><div className="kpi-value">{lowStock.length}</div><div className="kpi-sub">Items below threshold</div></div>
        <div className="kpi-card yellow"><div className="kpi-label">Items Tracked</div><div className="kpi-value">{items.length}</div></div>
        <div className="kpi-card blue"><div className="kpi-label">Total Distributed</div><div className="kpi-value">{distributions.length}</div><div className="kpi-sub">Distribution events</div></div>
        <div className="kpi-card green"><div className="kpi-label">Techs with Stock</div><div className="kpi-value">{techList.length}</div></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: tab === t.key ? 'var(--accent)' : 'var(--surface)', color: tab === t.key ? '#fff' : 'var(--text)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── INVENTORY TAB ─────────────────────────────────────────── */}
      {tab === 'inventory' && <>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search stock items…"
          style={{ marginBottom: 14, display: 'block', width: '100%', fontSize: 15, padding: '12px 16px' }} />

        {filteredItems.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No items found.</div>
        ) : (
          groupOrder.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat} style={{ marginBottom: 24 }}>
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
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Item</th><th>Unit</th><th>Office Qty</th><th>Min Qty</th><th>Cost/Unit</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {grouped[cat].map((i, idx) => {
                      const hasThreshold = i.min_qty > 0
                      const isLow = hasThreshold && i.office_qty <= i.min_qty
                      return (
                      <tr key={i.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{i.name}</td>
                        <td>{i.unit}</td>
                        <td style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)' }}>{i.office_qty}</td>
                        <td>{hasThreshold ? i.min_qty : '—'}</td>
                        <td>₹{i.unit_cost}</td>
                        <td><span className={`pill ${isLow ? 'pill-red' : hasThreshold ? 'pill-green' : 'pill-gray'}`}>{isLow ? '⚠ Low' : hasThreshold ? '✓ OK' : '— No threshold'}</span></td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setAdjusting(i)}>± Adjust</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(i)}>✏️</button>
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

      {/* ── DISTRIBUTE TAB ────────────────────────────────────────── */}
      {tab === 'distribute' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Distribution History</div>
              <button className="btn btn-purple btn-sm" onClick={() => { setModal('distribute'); setDistForm({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' }) }}>+ Distribute Stock</button>
            </div>
            {distributions.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No distributions yet</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Item</th><th>Qty</th><th>Technician</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {distributions.map(d => (
                      <tr key={d.id}>
                        <td>{formatISTDate(d.created_at)}</td>
                        <td style={{ fontWeight: 500 }}>{d.item_name}</td>
                        <td><b>{d.quantity}</b> {d.item_unit}</td>
                        <td>{d.employee_name || d.person || '—'}</td>
                        <td>{d.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── USAGE MONITOR TAB ────────────────────────────────────── */}
      {tab === 'emp-stock' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            👁 Showing how each technician is using their stock — what was distributed, what they still hold, what they installed, and what they returned.
          </div>
          {techList.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              No stock has been distributed to technicians yet
            </div>
          ) : techList.map(tech => {
            const isExpanded = expandedTech === tech.id
            return (
              <div key={tech.id} className="card" style={{ marginBottom: 16 }}>
                {/* Technician summary row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => toggleTech(tech.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>👷</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{tech.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tech.stockItems.length} item type{tech.stockItems.length !== 1 ? 's' : ''} in hand</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent2)' }}>{tech.totalDistributed}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Distributed</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--yellow)' }}>{tech.totalInHand}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>In Hand</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{tech.totalInstalled}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Installed</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue, #60a5fa)' }}>{tech.totalReturned}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Returned</div>
                    </div>
                    <span style={{ fontSize: 16, color: 'var(--muted)', marginLeft: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    {/* Current stock in hand */}
                    {tech.stockItems.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)', marginBottom: 6 }}>🎒 Currently In Hand</div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Item</th><th>Category</th><th>Unit</th><th>Qty in Hand</th></tr>
                            </thead>
                            <tbody>
                              {tech.stockItems.map(it => (
                                <tr key={it.item_id}>
                                  <td style={{ fontWeight: 500 }}>{it.item_name}</td>
                                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{it.category || '—'}</td>
                                  <td>{it.unit}</td>
                                  <td><b style={{ color: 'var(--accent2)' }}>{it.qty_in_hand}</b></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Distribution history for this tech */}
                    {tech.distHistory.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>📦 Distributions Received</div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Date</th><th>Item</th><th>Qty</th><th>Note</th></tr>
                            </thead>
                            <tbody>
                              {tech.distHistory.map(d => (
                                <tr key={d.id}>
                                  <td style={{ fontSize: 11 }}>{formatISTDate(d.created_at)}</td>
                                  <td style={{ fontWeight: 500 }}>{d.item_name}</td>
                                  <td><b>{d.quantity}</b> {d.item_unit}</td>
                                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Install/Return events from ledger */}
                    {(() => {
                      const techLedger = ledger.filter(e => e.employee_id === tech.id && ['install','return'].includes(e.transaction_type))
                      if (!techLedger.length) return null
                      return (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>🔧 Install & Return Activity</div>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr><th>Date</th><th>Action</th><th>Item</th><th>Qty</th><th>School / Note</th></tr>
                              </thead>
                              <tbody>
                                {techLedger.map(e => (
                                  <tr key={e.id}>
                                    <td style={{ fontSize: 11 }}>{formatISTDate(e.created_at)}</td>
                                    <td><span className={`pill ${e.transaction_type === 'install' ? 'pill-green' : 'pill-blue'}`}>{e.transaction_type === 'install' ? '🔧 Installed' : '↩ Returned'}</span></td>
                                    <td style={{ fontWeight: 500 }}>{e.item_name}</td>
                                    <td><b>{e.quantity}</b></td>
                                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{e.school_dest || e.note || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Field report proofs */}
                    {(() => {
                      const reports = techProofs[tech.id]
                      if (!reports) return <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>⏳ Loading site proofs...</div>
                      const withPhotos = reports.filter(r => r.photos?.length > 0)
                      if (!withPhotos.length) return (
                        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>📷 No site proof photos submitted yet</div>
                      )
                      return (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>📷 Site Proof Photos</div>
                          {withPhotos.map(r => (
                            <div key={r.id} style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span>{r.report_date}</span>
                                {r.school_name && <span style={{ color: 'var(--accent2)' }}>📍 {r.school_name}</span>}
                                {r.item_installed && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🔧 {r.item_installed}</span>}
                                <span className={`pill ${r.verification_status === 'verified' ? 'pill-green' : r.verification_status === 'rejected' ? 'pill-red' : 'pill-yellow'}`} style={{ fontSize: 10 }}>
                                  {r.verification_status === 'verified' ? '✓ Verified' : r.verification_status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {r.photos.map(p => (
                                  <div key={p.id} style={{ position: 'relative' }}>
                                    <img src={p.url} alt={p.photo_type}
                                      onClick={() => setLightbox(p.url)}
                                      style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '2px solid var(--border)' }}
                                      onError={e => { e.target.style.display='none' }}
                                    />
                                    <div style={{ fontSize: 9, textAlign: 'center', color: 'var(--muted)', marginTop: 2 }}>{p.photo_type}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
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

      {/* ── LEDGER TAB ────────────────────────────────────────────── */}
      {tab === 'purchases' && (
        <div className="card">
          <div className="card-title">Technician-Purchased Stock — Review &amp; Approve</div>
          {purchases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No purchases logged yet.</div>
          ) : (
            purchases.map(p => {
              const cfg = {
                pending:  { color: 'var(--yellow)', bg: 'rgba(251,191,36,.1)',  label: '⏳ Pending' },
                approved: { color: 'var(--green)',  bg: 'rgba(52,211,153,.1)',  label: '✅ Approved' },
                rejected: { color: 'var(--red)',     bg: 'rgba(248,113,113,.1)', label: '❌ Rejected' },
              }[p.status]
              return (
                <div key={p.id} style={{ background: 'var(--surface2)', border: `1px solid ${cfg.color}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.employee_name} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>bought</span> {p.item_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {p.quantity} unit{p.quantity > 1 ? 's' : ''} · ₹{p.amount_paid.toLocaleString('en-IN')} · 📅 {p.purchase_date}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 8, background: cfg.bg, color: cfg.color, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                      {cfg.label}
                    </span>
                  </div>

                  {p.bill_photo_url && (
                    <div style={{ marginBottom: 8 }}>
                      <img src={p.bill_photo_url} alt="bill" onClick={() => setLightbox(p.bill_photo_url)}
                        style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
                    </div>
                  )}

                  {p.admin_note && (
                    <div style={{ fontSize: 11, color: cfg.color, marginBottom: 8 }}>📝 {p.admin_note}</div>
                  )}

                  {p.status === 'approved' && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8,
                      color: p.reimbursement_status === 'unpaid' ? 'var(--yellow)' : 'var(--green)' }}>
                      {p.reimbursement_status === 'unpaid' && '💰 Repayment Pending'}
                      {p.reimbursement_status === 'paid_separately' && `💰 Repaid${p.reimbursement_note ? ` — ${p.reimbursement_note}` : ''}`}
                      {p.reimbursement_status === 'added_to_salary' && `💰 Added to ${p.reimbursed_month}/${p.reimbursed_year} salary`}
                    </div>
                  )}

                  {p.status === 'pending' && (
                    <div>
                      {expandedPurchase === p.id && (
                        <input placeholder="Optional note…" value={purchaseNotes[p.id] || ''}
                          onChange={e => setPurchaseNotes(n => ({ ...n, [p.id]: e.target.value }))}
                          style={{ marginBottom: 8 }} />
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-green btn-sm" onClick={() => {
                          if (expandedPurchase !== p.id) { setExpandedPurchase(p.id); return }
                          reviewPurchase(p.id, 'approved', purchaseNotes[p.id])
                        }}>✅ Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => {
                          if (expandedPurchase !== p.id) { setExpandedPurchase(p.id); return }
                          reviewPurchase(p.id, 'rejected', purchaseNotes[p.id])
                        }}>❌ Reject</button>
                      </div>
                    </div>
                  )}

                  {p.status === 'approved' && p.reimbursement_status === 'unpaid' && (
                    <div>
                      {expandedPurchase === p.id && (
                        <input placeholder="How was it repaid? (e.g. cash, UPI)…" value={purchaseNotes[p.id] || ''}
                          onChange={e => setPurchaseNotes(n => ({ ...n, [p.id]: e.target.value }))}
                          style={{ marginBottom: 8 }} />
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        if (expandedPurchase !== p.id) { setExpandedPurchase(p.id); return }
                        repayPurchase(p.id, purchaseNotes[p.id])
                      }}>💰 Mark as Repaid</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="card">
          <div className="card-title">Stock Ledger</div>
          <div className="table-wrap scroll-table" style={{ maxHeight: 500 }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Item</th><th>Batch</th><th>Qty</th><th>Person/Tech</th><th>Buy Price</th><th>School/Site</th><th>Note</th><th>Del</th></tr>
              </thead>
              <tbody>
                {ledger.map(e => (
                  <tr key={e.id}>
                    <td>{formatISTDate(e.created_at)}</td>
                    <td><span className={`pill ${TYPE_COLOR[e.transaction_type] || 'pill-blue'}`}>{TYPE_LABEL[e.transaction_type] || e.transaction_type}</span></td>
                    <td>{e.item_name}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{e.batch_no || '—'}</td>
                    <td><b>{e.quantity}</b></td>
                    <td>{e.employee_name || e.person || '—'}</td>
                    <td>{e.buy_price ? `₹${e.buy_price}` : '—'}</td>
                    <td style={{ fontSize: 11 }}>{e.school_dest || '—'}</td>
                    <td>{e.note || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => delLedger(e.id)}>Del</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BATCH LOOKUP TAB ──────────────────────────────────────── */}
      {tab === 'batches' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🔍 Batch Lookup</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Pick an item to see every batch received, how much is left, and (by clicking a batch) exactly which technicians and schools it went to.</p>
            <div className="form-group form-full">
              <label>Item</label>
              <SearchableSelect value={lookupItem} onChange={setLookupItem}
                placeholder="Select item…"
                options={items.map(i => ({ value: String(i.id), label: i.name }))} />
            </div>
          </div>

          {lookupItem && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Batches</div>
              {lookupBatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No batches received for this item yet</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Batch No</th><th>Source</th><th>Received</th><th>Qty Received</th><th>In Office Now</th><th></th></tr>
                    </thead>
                    <tbody>
                      {lookupBatches.map(b => (
                        <tr key={b.id} style={{ cursor: 'pointer', background: lookupTrace?.batch?.id === b.id ? 'var(--surface2)' : 'transparent' }} onClick={() => openTrace(b.id)}>
                          <td style={{ fontWeight: 600 }}>{b.batch_no}</td>
                          <td style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{b.source}</td>
                          <td style={{ fontSize: 12 }}>{b.received_date}</td>
                          <td>{b.qty_received}</td>
                          <td><b style={{ color: b.qty_office > 0 ? 'var(--green)' : 'var(--muted)' }}>{b.qty_office}</b></td>
                          <td><button className="btn btn-outline btn-sm" onClick={() => openTrace(b.id)}>🔍 Trace</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {lookupTrace && (
            <div className="card">
              <div className="card-title">📍 {lookupTrace.batch.batch_no} — Movement History</div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                {lookupTrace.item_name} · received {lookupTrace.batch.received_date} · {lookupTrace.batch.qty_received} units · <b>{lookupTrace.batch.qty_office}</b> still in office
                {lookupTrace.batch.person && <> · from {lookupTrace.batch.person}</>}
              </p>

              {lookupTrace.holders && lookupTrace.holders.length > 0 && (
                <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,.08)', border: '1px solid var(--yellow)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', marginBottom: 4 }}>🎒 Currently Held By</div>
                  {lookupTrace.holders.map(h => (
                    <div key={h.employee_id} style={{ fontSize: 12 }}>{h.employee_name} — <b>{h.qty_in_hand}</b> units</div>
                  ))}
                </div>
              )}

              {lookupTrace.movements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                  {lookupTrace.batch.qty_office === lookupTrace.batch.qty_received
                    ? 'No movements yet — still fully in office'
                    : lookupTrace.holders?.length > 0
                      ? 'No ledger movements recorded — this batch predates batch tracking, but current holders are shown above.'
                      : "No recorded movements, and no one currently holds this batch — it likely left the system before batch tracking existed."}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Action</th><th>Qty</th><th>Technician</th><th>School / Site</th><th>Note</th></tr>
                    </thead>
                    <tbody>
                      {lookupTrace.movements.map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize: 11 }}>{formatISTDate(m.created_at)}</td>
                          <td><span className={`pill ${TYPE_COLOR[m.transaction_type] || 'pill-blue'}`}>{TYPE_LABEL[m.transaction_type] || m.transaction_type}</span></td>
                          <td><b>{m.quantity}</b></td>
                          <td>{m.employee_name || m.person || '—'}</td>
                          <td style={{ fontSize: 12 }}>{m.school_dest || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{m.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── REORDER TAB ──────────────────────────────────────────── */}
      {tab === 'reorder' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={() => sendReorderSummaryWhatsApp(reorders)}>📤 Send Reorder List</button>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">⚠️ Needs Reorder ({needsReorder.length})</div>
            {needsReorder.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Nothing currently below its threshold without an open request.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Office Qty</th><th>Min Qty</th><th></th></tr></thead>
                  <tbody>
                    {needsReorder.map(i => (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 500 }}>{i.name}</td>
                        <td style={{ color: 'var(--red)', fontWeight: 700 }}>{i.office_qty}</td>
                        <td>{i.min_qty}</td>
                        <td><button className="btn btn-primary btn-sm" onClick={() => { setReorderModal(i); setReorderForm({ quantity: Math.max(i.min_qty - i.office_qty, 1), note: '' }) }}>+ Request Reorder</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🔄 Open Requests ({openReorders.length})</div>
            {openReorders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No open reorder requests</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Requested By</th><th>When</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {openReorders.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>{r.item_name}</td>
                        <td><b>{r.requested_qty}</b> {r.item_unit}</td>
                        <td>{r.requester_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{formatISTDate(r.requested_at)}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.note || '—'}</td>
                        <td><span className={`pill ${r.status === 'ordered' ? 'pill-blue' : 'pill-yellow'}`}>{r.status === 'ordered' ? '🚚 Ordered' : '🆕 Pending'}</span></td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          {r.status === 'pending' && <button className="btn btn-outline btn-sm" onClick={() => updateReorder(r.id, 'ordered')}>Mark Ordered</button>}
                          <button className="btn btn-green btn-sm" onClick={() => { setReceiveModal(r); setReceiveForm({ quantity: r.requested_qty, buy_price: '', person: '' }) }}>✅ Received</button>
                          <button className="btn btn-danger btn-sm" onClick={() => updateReorder(r.id, 'cancelled')}>✕ Cancel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {resolvedReorders.length > 0 && (
            <div className="card">
              <div className="card-title">Recently Resolved</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Status</th><th>Resolved By</th><th>When</th></tr></thead>
                  <tbody>
                    {resolvedReorders.map(r => (
                      <tr key={r.id}>
                        <td>{r.item_name}</td>
                        <td>{r.requested_qty} {r.item_unit}</td>
                        <td><span className={`pill ${r.status === 'received' ? 'pill-green' : 'pill-gray'}`}>{r.status === 'received' ? '✅ Received' : '✕ Cancelled'}</span></td>
                        <td>{r.resolver_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{formatISTDate(r.resolved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACCOUNTS TAB ──────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div className="kpi-card green">
              <div className="kpi-label">Total Spent on Stock</div>
              <div className="kpi-value">₹{accounts.grand_total.toLocaleString('en-IN')}</div>
              <div className="kpi-sub">{accounts.batches.length} batch{accounts.batches.length !== 1 ? 'es' : ''} with cost data</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📅 Monthly Breakdown</div>
            {accounts.monthly.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No cost data recorded yet</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Month</th><th>Total Spent</th></tr></thead>
                  <tbody>
                    {accounts.monthly.map(m => (
                      <tr key={m.month}>
                        <td style={{ fontWeight: 600 }}>{m.month}</td>
                        <td><b>₹{m.total.toLocaleString('en-IN')}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">🧾 Per-Batch Cost Breakdown</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Money spent per batch received — purchase price plus logistics (manufacturer → office, office → technician).</p>
            {accounts.batches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No batches with cost data yet</div>
            ) : (
              <div className="table-wrap scroll-table" style={{ maxHeight: 500 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Batch No</th><th>Item</th><th>Source</th><th>Received</th><th>Qty</th>
                      <th>Buy Price</th><th>Logistics 1 (Mfr→Office)</th><th>Logistics 2 (Office→Tech)</th>
                      <th>Total Cost</th><th>Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.batches.map(b => (
                      <tr key={b.batch_id}>
                        <td style={{ fontWeight: 600 }}>{b.batch_no}</td>
                        <td>{b.item_name}</td>
                        <td style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{b.source}</td>
                        <td style={{ fontSize: 12 }}>{b.received_date}</td>
                        <td>{b.qty_received} {b.item_unit}</td>
                        <td>{b.buy_price ? `₹${b.buy_price.toLocaleString('en-IN')}` : '—'}</td>
                        <td>{b.logistics1 ? `₹${b.logistics1.toLocaleString('en-IN')}` : '—'}</td>
                        <td>{b.logistics2 ? `₹${b.logistics2.toLocaleString('en-IN')}` : '—'}</td>
                        <td><b style={{ color: 'var(--green)' }}>₹{b.total_cost.toLocaleString('en-IN')}</b></td>
                        <td style={{ fontSize: 12 }}>{b.person || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Reorder */}
      {reorderModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <button className="modal-close" onClick={() => setReorderModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔄 Request Reorder</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              {reorderModal.name} · currently <b style={{ color: 'var(--red)' }}>{reorderModal.office_qty}</b>, threshold {reorderModal.min_qty}
            </p>
            <form onSubmit={requestReorder}>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Quantity to Order</label>
                <input required type="number" min="1" value={reorderForm.quantity} onChange={e => setReorderForm({ ...reorderForm, quantity: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Note</label>
                <input value={reorderForm.note} onChange={e => setReorderForm({ ...reorderForm, note: e.target.value })} placeholder="Supplier, urgency, etc…" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Request Reorder</button>
                <button type="button" className="btn btn-outline" onClick={() => setReorderModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Received — actually adds stock as a new batch */}
      {receiveModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <button className="modal-close" onClick={() => setReceiveModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✅ Confirm Stock Received</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              {receiveModal.item_name} · requested {receiveModal.requested_qty} {receiveModal.item_unit}. This creates a new batch and adds to office stock — confirm the actual quantity that arrived.
            </p>
            <form onSubmit={confirmReceive}>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Quantity Received</label>
                <input required type="number" min="1" value={receiveForm.quantity} onChange={e => setReceiveForm({ ...receiveForm, quantity: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Buy Price (₹, optional)</label>
                <input type="number" value={receiveForm.buy_price} onChange={e => setReceiveForm({ ...receiveForm, buy_price: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Supplier (optional)</label>
                <input value={receiveForm.person} onChange={e => setReceiveForm({ ...receiveForm, person: e.target.value })} placeholder="Who supplied it…" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Confirm Received</button>
                <button type="button" className="btn btn-outline" onClick={() => setReceiveModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────── */}

      {/* Add / Edit Item */}
      {(modal === 'add-item' || modal === 'edit-item') && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => { setModal(null); setEditItem(null) }}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editItem ? '✏️ Edit Stock Item' : '+ New Stock Item'}</h3>
            <form onSubmit={saveItem}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Name *</label><input required value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} /></div>
                <div className="form-group"><label>Category</label>
                  <select value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})}>
                    <option value="">— Select —</option>
                    {STOCK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Unit</label>
                  <select value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})}>
                    {['pcs','nos','ltrs','kgs','mtrs','sets','rolls'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Min Qty Alert</label><input type="number" value={itemForm.min_qty} onChange={e => setItemForm({...itemForm, min_qty: e.target.value})} /></div>
                <div className="form-group"><label>Cost/Unit (₹)</label><input type="number" value={itemForm.unit_cost} onChange={e => setItemForm({...itemForm, unit_cost: e.target.value})} /></div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">{editItem ? 'Update' : 'Save'}</button>
                <button type="button" className="btn btn-outline" onClick={() => { setModal(null); setEditItem(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive / Transfer / Issue */}
      {['receive','issue'].includes(modal) && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, textTransform: 'capitalize' }}>{modal} Stock</h3>
            <form onSubmit={saveLedger}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Item *</label>
                  <SearchableSelect value={ledgerForm.item_id} onChange={val => setLedgerForm({...ledgerForm, item_id: val, batch_id: ''})}
                    placeholder="Select item…"
                    options={items.map(i => ({ value: String(i.id), label: `${i.name} (in office: ${i.office_qty})` }))} />
                </div>
                {modal === 'issue' && (
                  <div className="form-group form-full"><label>Batch *</label>
                    {ledgerBatches.length === 1 ? (
                      <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                        {batchLabel(ledgerBatches[0])} <span style={{ color: 'var(--accent)' }}>(only batch — auto-selected)</span>
                      </div>
                    ) : (
                      <SearchableSelect value={ledgerForm.batch_id} onChange={val => setLedgerForm({...ledgerForm, batch_id: val})}
                        placeholder={ledgerForm.item_id ? 'Select batch…' : 'Select an item first'}
                        options={ledgerBatches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
                    )}
                  </div>
                )}
                <div className="form-group"><label>Quantity *</label><input required type="number" min="1" max={modal === 'issue' ? (selectedLedgerBatch?.qty_office || 0) : undefined} value={ledgerForm.quantity} onChange={e => setLedgerForm({...ledgerForm, quantity: e.target.value})} /></div>
                <div className="form-group"><label>Person</label>
                  <SearchableSelect value={ledgerForm.person} onChange={val => setLedgerForm({...ledgerForm, person: val})}
                    placeholder="— Select —"
                    options={employees.map(e => ({ value: e.name, label: `${e.name} (${e.employee_code})` }))} />
                </div>
                {modal === 'receive' && <>
                  <div className="form-group"><label>Buy Price (₹)</label><input type="number" value={ledgerForm.buy_price} onChange={e => setLedgerForm({...ledgerForm, buy_price: e.target.value})} /></div>
                  <div className="form-group"><label>Logistics 1 (Mfr→Office)</label><input type="number" value={ledgerForm.logistics1} onChange={e => setLedgerForm({...ledgerForm, logistics1: e.target.value})} /></div>
                  <div className="form-group"><label>Logistics 2 (Office→Tech)</label><input type="number" value={ledgerForm.logistics2} onChange={e => setLedgerForm({...ledgerForm, logistics2: e.target.value})} /></div>
                </>}
                {modal === 'issue' && (
                  <div className="form-group form-full"><label>School / Destination</label>
                    <SearchableSelect value={ledgerForm.school_dest} onChange={val => setLedgerForm({...ledgerForm, school_dest: val})}
                      placeholder="— Select School —"
                      options={schools.map(s => ({ value: s.name, label: s.name }))} />
                  </div>
                )}
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

      {/* Distribute to Technician */}
      {modal === 'distribute' && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📤 Distribute Stock to Technician</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>This deducts from office stock and adds to the technician's personal inventory.</p>
            <form onSubmit={distribute}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Item *</label>
                  <SearchableSelect value={distForm.item_id} onChange={val => setDistForm({...distForm, item_id: val, batch_id: ''})}
                    placeholder="Select item…"
                    options={items.filter(i => i.office_qty > 0).map(i => ({ value: String(i.id), label: `${i.name} — ${i.office_qty} ${i.unit} in office` }))} />
                </div>
                {selectedItem && (
                  <div className="form-group form-full">
                    <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      Office stock: <b style={{ color: 'var(--accent2)' }}>{selectedItem.office_qty} {selectedItem.unit}</b>
                    </div>
                  </div>
                )}
                <div className="form-group form-full"><label>Batch *</label>
                  {distBatches.length === 1 ? (
                    <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                      {batchLabel(distBatches[0])} <span style={{ color: 'var(--accent)' }}>(only batch — auto-selected)</span>
                    </div>
                  ) : (
                    <SearchableSelect value={distForm.batch_id} onChange={val => setDistForm({...distForm, batch_id: val})}
                      placeholder={distForm.item_id ? 'Select batch…' : 'Select an item first'}
                      options={distBatches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
                  )}
                </div>
                <div className="form-group form-full"><label>Technician *</label>
                  <SearchableSelect value={distForm.employee_id} onChange={val => setDistForm({...distForm, employee_id: val})}
                    placeholder="Select technician…"
                    options={employees.filter(e => e.role === 'technician').map(e => ({ value: String(e.id), label: `${e.name} (${e.employee_code})` }))} />
                </div>
                <div className="form-group"><label>Quantity *</label>
                  <input required type="number" min="1" max={selectedDistBatch?.qty_office || 0} value={distForm.quantity}
                    onChange={e => setDistForm({...distForm, quantity: e.target.value})} />
                </div>
                <div className="form-group"><label>Note</label>
                  <input value={distForm.note} onChange={e => setDistForm({...distForm, note: e.target.value})} placeholder="Optional note..." />
                </div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-purple">📤 Distribute</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
        }}>
          <img src={lightbox} alt="proof" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {adjusting && <AdjustStockModal item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { load(); showToast('Stock updated!') }} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function AdjustStockModal({ item, onClose, onSaved }) {
  const currentPrice = item.unit_price ?? item.unit_cost ?? 0
  const [qty, setQty] = useState(0)
  const [action, setAction] = useState('add')
  const [notes, setNotes] = useState('')
  const [batchId, setBatchId] = useState('')
  const [batches, setBatches] = useState([])
  const [price, setPrice] = useState(currentPrice)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (action === 'remove') {
      api.get('/api/stock/batches', { params: { item_id: item.id } }).then(r => {
        setBatches(r.data)
        if (r.data.length === 1) setBatchId(String(r.data[0].id))
      })
    }
  }, [action, item.id])

  const selectedBatch = batches.find(b => b.id === parseInt(batchId))

  async function submit() {
    const delta = action === 'add' ? Number(qty) : -Number(qty)
    if (action === 'remove' && !batchId) { setError('Select which batch this is being removed from'); return }
    const priceChanged = Number(price) !== Number(currentPrice)
    if (!delta && !priceChanged) { setError('Change the quantity or the price before updating'); return }
    try {
      setLoading(true)
      await api.post(`/api/stock/${item.id}/adjust`, {
        quantity_change: delta, notes,
        batch_id: action === 'remove' ? parseInt(batchId) : null,
        new_unit_cost: priceChanged ? Number(price) : null
      })
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
          {item.name} · <b>₹{(item.unit_cost ?? 0).toLocaleString('en-IN')}/{item.unit || 'pcs'}</b>
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Current stock: <b>{item.office_qty || 0} {item.unit || 'pcs'}</b>
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {['add','remove'].map(a => (
            <button key={a} onClick={() => { setAction(a); setBatchId('') }} style={{
              flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
              background: action === a ? (a === 'add' ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)') : 'var(--surface2)',
              border: `1.5px solid ${action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              color: action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--muted)'
            }}>{a === 'add' ? '+ Add Stock' : '- Remove Stock'}</button>
          ))}
        </div>
        {action === 'remove' && (
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Batch *</label>
            {batches.length === 1 ? (
              <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                {batchLabel(batches[0])} <span style={{ color: 'var(--accent)' }}>(only batch — auto-selected)</span>
              </div>
            ) : (
              <SearchableSelect value={batchId} onChange={setBatchId}
                placeholder="Select batch…"
                options={batches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
            )}
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Quantity</label>
          <input type="number" min="1" max={action === 'remove' ? (selectedBatch?.qty_office || 0) : undefined} value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Price per {item.unit || 'pcs'} (₹)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
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
