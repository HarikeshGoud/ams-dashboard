import { useState, useEffect } from 'react'
import api from '../../api/axios'
import SearchableSelect from '../../components/SearchableSelect'
import { sendReorderSummaryWhatsApp } from '../../utils/reorderSummary'
import { formatISTDate } from '../../utils/istTime'

const CAT_A = '50/100 LPH RO Units'
const CAT_B = '1000/1500/2000 LPH RO Units'
const TYPE_COLOR = { receive: 'pill-green', transfer: 'pill-blue', issue: 'pill-orange', distribute: 'pill-purple', return: 'pill-yellow', install: 'pill-red', purchase: 'pill-blue' }
const TYPE_LABEL = { receive: '⬇ Receive', transfer: '↔ Transfer', issue: '↑ Issue', distribute: '📦 Distribute', return: '↩ Return', install: '🔧 Install', purchase: '🛒 Purchase' }

function batchLabel(b) {
  return `${b.batch_no} — ${b.qty_office} left (received ${b.received_date})`
}

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
  const [distForm, setDistForm]     = useState({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' })
  const [distBatches, setDistBatches] = useState([])
  const [ledger, setLedger]         = useState([])
  const [expandedTech, setExpandedTech] = useState(null)
  const [techProofs, setTechProofs]     = useState({})
  const [lightbox, setLightbox]         = useState(null)
  const [purchases, setPurchases]       = useState([])
  const [expandedPurchase, setExpandedPurchase] = useState(null)
  const [purchaseNotes, setPurchaseNotes]       = useState({})
  const [lookupItem, setLookupItem]       = useState('')
  const [lookupBatches, setLookupBatches] = useState([])
  const [lookupTrace, setLookupTrace]     = useState(null)
  const [reorders, setReorders]           = useState([])
  const [reorderModal, setReorderModal]   = useState(null)
  const [reorderForm, setReorderForm]     = useState({ quantity: 1, note: '' })
  const [receiveModal, setReceiveModal]   = useState(null)
  const [receiveForm, setReceiveForm]     = useState({ quantity: 1, buy_price: '', person: '' })
  const [accounts, setAccounts]           = useState({ batches: [], monthly: [], grand_total: 0 })
  const [toast, setToast]           = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([
      api.get('/api/stock/'),
      api.get('/api/employees/'),
      api.get('/api/stock/distributions'),
      api.get('/api/stock/employee-stock'),
      api.get('/api/stock/ledger'),
      api.get('/api/stock-purchases/'),
      api.get('/api/reorder/'),
      api.get('/api/stock/accounts'),
    ]).then(([it, emp, dist, es, lg, pu, ro, ac]) => {
      setItems(it.data || [])
      setEmployees(emp.data || [])
      setDist(dist.data || [])
      setEmpStock(es.data || [])
      setLedger(lg.data || [])
      setPurchases(pu.data || [])
      setReorders(ro.data || [])
      setAccounts(ac.data || { batches: [], monthly: [], grand_total: 0 })
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

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

  useEffect(() => {
    if (distModal && distForm.item_id) {
      api.get('/api/stock/batches', { params: { item_id: distForm.item_id } }).then(r => {
        setDistBatches(r.data)
        if (r.data.length === 1) setDistForm(f => ({ ...f, batch_id: String(r.data[0].id) }))
      })
    } else { setDistBatches([]) }
  }, [distModal, distForm.item_id])

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
      showToast('✅ Stock distributed to technician!')
      setDistModal(false); load()
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
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
  const selectedDistBatch = distBatches.find(b => b.id === parseInt(distForm.batch_id))

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

  const openReorders = reorders.filter(r => r.status === 'pending' || r.status === 'ordered')
  const openReorderItemIds = new Set(openReorders.map(r => r.item_id))
  const needsReorder = items.filter(i => (i.min_quantity || 0) > 0 && (i.quantity || 0) <= (i.min_quantity || 0) && !openReorderItemIds.has(i.id))
  const resolvedReorders = reorders.filter(r => r.status === 'received' || r.status === 'cancelled').slice(0, 20)

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>📦 Stock Management</h3>
        <div className="flex gap-8">
          <button className="btn btn-purple" style={{ fontSize: 12 }} onClick={() => { setDistModal(true); setDistForm({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' }) }}>📤 Distribute to Tech</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ Add Item</button>
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'inventory',  label: '📦 Inventory' },
          { key: 'distribute', label: '📤 Distribute' },
          { key: 'emp-stock',  label: `👁 Usage Monitor${techList.length ? ` (${techList.length})` : ''}` },
          { key: 'purchases',  label: `🛒 Purchased Stock${purchases.filter(p => p.status === 'pending').length ? ` (${purchases.filter(p => p.status === 'pending').length})` : ''}` },
          { key: 'ledger',     label: '📋 Ledger' },
          { key: 'batches',    label: '🔍 Batch Lookup' },
          { key: 'reorder',    label: `🔄 Reorder${needsReorder.length + openReorders.length ? ` (${needsReorder.length + openReorders.length})` : ''}` },
          { key: 'accounts',   label: '💰 Accounts' },
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
            <button className="btn btn-purple btn-sm" onClick={() => { setDistModal(true); setDistForm({ item_id: '', batch_id: '', employee_id: '', quantity: 1, note: '' }) }}>+ Distribute</button>
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
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{formatISTDate(d.created_at)}</td>
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
                  onClick={() => toggleTech(tech.id)}>
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
                        <div style={{ overflowX: 'auto' }}>
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
                      </div>
                    )}
                    {tech.distHistory.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>📦 Distributions Received</div>
                        <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10 }}>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th>
                            <th style={{ padding: '4px 8px', textAlign: 'left' }}>Qty</th>
                          </tr></thead>
                          <tbody>
                            {tech.distHistory.map(d => (
                              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px', fontSize: 11 }}>{formatISTDate(d.created_at)}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{d.item_name}</td>
                                <td style={{ padding: '6px 8px' }}><b>{d.quantity}</b> {d.item_unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                    {(() => {
                      const techLedger = ledger.filter(e => e.employee_id === tech.id && ['install','return'].includes(e.transaction_type))
                      if (!techLedger.length) return null
                      return (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>🔧 Install & Return Activity</div>
                          <div style={{ overflowX: 'auto' }}>
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
                                  <td style={{ padding: '6px 8px', fontSize: 11 }}>{formatISTDate(e.created_at)}</td>
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
                        </div>
                      )
                    })()}

                    {/* Field report proofs */}
                    {(() => {
                      const reports = techProofs[tech.id]
                      if (!reports) return <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>⏳ Loading site proofs...</div>
                      const withPhotos = reports.filter(r => r.photos?.length > 0)
                      if (!withPhotos.length) return (
                        <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>📷 No site proof photos submitted yet</div>
                      )
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>📷 Site Proof Photos</div>
                          {withPhotos.map(r => (
                            <div key={r.id} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span>{r.report_date}</span>
                                {r.school_name && <span style={{ color: 'var(--accent2)' }}>📍 {r.school_name}</span>}
                                {r.item_installed && <span style={{ fontSize: 10, color: 'var(--muted)' }}>🔧 {r.item_installed}</span>}
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                                  background: r.verification_status === 'verified' ? 'rgba(52,211,153,.15)' : r.verification_status === 'rejected' ? 'rgba(248,113,113,.15)' : 'rgba(250,204,21,.15)',
                                  color: r.verification_status === 'verified' ? 'var(--green)' : r.verification_status === 'rejected' ? 'var(--red)' : 'var(--yellow)' }}>
                                  {r.verification_status === 'verified' ? '✓ Verified' : r.verification_status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {r.photos.map(p => (
                                  <div key={p.id}>
                                    <img src={p.url} alt={p.photo_type}
                                      onClick={() => setLightbox(p.url)}
                                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '2px solid var(--border)' }}
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

      {/* ── PURCHASED STOCK TAB ── */}
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

      {/* ── LEDGER TAB ── */}
      {tab === 'ledger' && (
        <div className="card">
          <div className="card-title">Stock Ledger</div>
          <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Batch</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Person/Tech</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>School/Site</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{formatISTDate(e.created_at)}</td>
                    <td style={{ padding: '8px 10px' }}><span className={`pill ${TYPE_COLOR[e.transaction_type] || 'pill-blue'}`}>{TYPE_LABEL[e.transaction_type] || e.transaction_type}</span></td>
                    <td style={{ padding: '8px 10px' }}>{e.item_name}</td>
                    <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--muted)' }}>{e.batch_no || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><b>{e.quantity}</b></td>
                    <td style={{ padding: '8px 10px' }}>{e.employee_name || e.person || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 11 }}>{e.school_dest || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{e.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BATCH LOOKUP TAB ── */}
      {tab === 'batches' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">🔍 Batch Lookup</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Pick an item to see every batch received, how much is left, and (by clicking a batch) exactly which technicians and schools it went to.</p>
            <div className="form-group form-full">
              <label>Item</label>
              <SearchableSelect value={lookupItem} onChange={setLookupItem}
                placeholder="Select item…"
                options={items.map(i => ({ value: String(i.id), label: i.name || i.item_name }))} />
            </div>
          </div>

          {lookupItem && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Batches</div>
              {lookupBatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No batches received for this item yet</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Batch No</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Source</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Received</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty Received</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>In Office Now</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookupBatches.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: lookupTrace?.batch?.id === b.id ? 'var(--surface2)' : 'transparent' }} onClick={() => openTrace(b.id)}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{b.batch_no}</td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{b.source}</td>
                          <td style={{ padding: '8px 10px', fontSize: 12 }}>{b.received_date}</td>
                          <td style={{ padding: '8px 10px' }}>{b.qty_received}</td>
                          <td style={{ padding: '8px 10px' }}><b style={{ color: b.qty_office > 0 ? 'var(--green)' : 'var(--muted)' }}>{b.qty_office}</b></td>
                          <td style={{ padding: '8px 10px' }}><button className="btn btn-outline btn-sm" onClick={() => openTrace(b.id)}>🔍 Trace</button></td>
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
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Action</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Technician</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>School / Site</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookupTrace.movements.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px', fontSize: 11 }}>{formatISTDate(m.created_at)}</td>
                          <td style={{ padding: '8px 10px' }}><span className={`pill ${TYPE_COLOR[m.transaction_type] || 'pill-blue'}`}>{TYPE_LABEL[m.transaction_type] || m.transaction_type}</span></td>
                          <td style={{ padding: '8px 10px' }}><b>{m.quantity}</b></td>
                          <td style={{ padding: '8px 10px' }}>{m.employee_name || m.person || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 12 }}>{m.school_dest || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{m.note || '—'}</td>
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

      {/* ── REORDER TAB ── */}
      {tab === 'reorder' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn btn-outline btn-sm" onClick={() => sendReorderSummaryWhatsApp(reorders)}>📤 Send Reorder List</button>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">⚠️ Needs Reorder ({needsReorder.length})</div>
            {needsReorder.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Nothing currently below its threshold without an open request.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Office Qty</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Min Qty</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsReorder.map(i => (
                      <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{i.name || i.item_name}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--red)', fontWeight: 700 }}>{i.quantity}</td>
                        <td style={{ padding: '8px 10px' }}>{i.min_quantity}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => { setReorderModal(i); setReorderForm({ quantity: Math.max((i.min_quantity || 0) - (i.quantity || 0), 1), note: '' }) }}>+ Request Reorder</button>
                        </td>
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Requested By</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>When</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Note</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openReorders.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.item_name}</td>
                        <td style={{ padding: '8px 10px' }}><b>{r.requested_qty}</b> {r.item_unit}</td>
                        <td style={{ padding: '8px 10px' }}>{r.requester_name || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{formatISTDate(r.requested_at)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{r.note || '—'}</td>
                        <td style={{ padding: '8px 10px' }}><span className={`pill ${r.status === 'ordered' ? 'pill-blue' : 'pill-yellow'}`}>{r.status === 'ordered' ? '🚚 Ordered' : '🆕 Pending'}</span></td>
                        <td style={{ padding: '8px 10px', display: 'flex', gap: 6 }}>
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Resolved By</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedReorders.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>{r.item_name}</td>
                        <td style={{ padding: '8px 10px' }}>{r.requested_qty} {r.item_unit}</td>
                        <td style={{ padding: '8px 10px' }}><span className={`pill ${r.status === 'received' ? 'pill-green' : 'pill-gray'}`}>{r.status === 'received' ? '✅ Received' : '✕ Cancelled'}</span></td>
                        <td style={{ padding: '8px 10px' }}>{r.resolver_name || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{formatISTDate(r.resolved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACCOUNTS TAB ── */}
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Month</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Total Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.monthly.map(m => (
                      <tr key={m.month} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.month}</td>
                        <td style={{ padding: '8px 10px' }}><b>₹{m.total.toLocaleString('en-IN')}</b></td>
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
              <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Batch No</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Source</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Received</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Qty</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Buy Price</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Logistics 1 (Mfr→Office)</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Logistics 2 (Office→Tech)</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Total Cost</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left' }}>Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.batches.map(b => (
                      <tr key={b.batch_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{b.batch_no}</td>
                        <td style={{ padding: '8px 10px' }}>{b.item_name}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{b.source}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{b.received_date}</td>
                        <td style={{ padding: '8px 10px' }}>{b.qty_received} {b.item_unit}</td>
                        <td style={{ padding: '8px 10px' }}>{b.buy_price ? `₹${b.buy_price.toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{b.logistics1 ? `₹${b.logistics1.toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{b.logistics2 ? `₹${b.logistics2.toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}><b style={{ color: 'var(--green)' }}>₹{b.total_cost.toLocaleString('en-IN')}</b></td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{b.person || '—'}</td>
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
              {reorderModal.name || reorderModal.item_name} · currently <b style={{ color: 'var(--red)' }}>{reorderModal.quantity}</b>, threshold {reorderModal.min_quantity}
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
              background: cat === CAT_A ? 'rgba(34,211,238,.08)' : cat === CAT_B ? 'rgba(52,211,153,.08)' : 'var(--surface2)',
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
                    const hasThreshold = minQty > 0
                    const isLow  = hasThreshold && qty <= minQty
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
                            background: isLow ? 'rgba(248,113,113,.15)' : hasThreshold ? 'rgba(52,211,153,.15)' : 'rgba(148,163,184,.15)',
                            color: isLow ? 'var(--red)' : hasThreshold ? 'var(--green)' : 'var(--muted)'
                          }}>
                            {isLow ? 'Low' : hasThreshold ? 'OK' : 'No threshold'}
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
                <SearchableSelect value={distForm.item_id} onChange={val => setDistForm({...distForm, item_id: val, batch_id: ''})}
                  placeholder="Select item…"
                  options={items.filter(i => (i.office_qty || i.quantity || 0) > 0).map(i => ({ value: String(i.id), label: `${i.name} — ${i.office_qty || i.quantity} ${i.unit} in office` }))} />
              </div>
              {selectedItem && (
                <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                  Office stock: <b style={{ color: 'var(--accent2)' }}>{selectedItem.office_qty || selectedItem.quantity} {selectedItem.unit}</b>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Batch *</label>
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
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Technician *</label>
                <SearchableSelect value={distForm.employee_id} onChange={val => setDistForm({...distForm, employee_id: val})}
                  placeholder="Select technician…"
                  options={employees.filter(e => e.role === 'technician').map(e => ({ value: String(e.id), label: `${e.name} (${e.employee_code || 'no code'})` }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Quantity *</label>
                  <input required type="number" min="1" max={selectedDistBatch?.qty_office || 0} value={distForm.quantity}
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

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(0,0,0,.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
        }}>
          <img src={lightbox} alt="proof" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
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
            <option value="ATW Parts">ATW Parts</option>
            <option value="Consumables">Consumables</option>
            <option value="Electrical">Electrical</option>
            <option value="Filter">Filter</option>
            <option value="Fittings">Fittings</option>
            <option value="Membranes">Membranes</option>
            <option value="Pumps">Pumps</option>
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
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>± Adjust Stock</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          {item.name} · <b>₹{(item.unit_price ?? item.unit_cost ?? 0).toLocaleString('en-IN')}/{item.unit || 'Nos'}</b>
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Current stock: <b>{item.quantity || 0} {item.unit || 'Nos'}</b>
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['add','remove'].map(a => (
            <button key={a} onClick={() => { setAction(a); setBatchId('') }} style={{
              flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
              background: action === a ? (a === 'add' ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)') : 'var(--surface2)',
              border: `1.5px solid ${action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              color: action === a ? (a === 'add' ? 'var(--green)' : 'var(--red)') : 'var(--muted)'
            }}>{a === 'add' ? '+ Add Stock' : '- Remove Stock'}</button>
          ))}
        </div>
        <div className="form-grid">
          {action === 'remove' && (
            <div className="form-group form-full"><label>Batch *</label>
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
          <div className="form-group"><label>Quantity</label>
            <input type="number" min="1" max={action === 'remove' ? (selectedBatch?.qty_office || 0) : undefined} value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div className="form-group"><label>Price per {item.unit || 'Nos'} (₹)</label>
            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div className="form-group form-full"><label>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason / reference…" />
          </div>
        </div>
        {error && <div className="alert alert-red" style={{ margin: '14px 0 0' }}><span>⚠️</span><div>{error}</div></div>}
        <div className="mt-16 flex gap-8">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? '⏳…' : 'Update Stock'}</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
