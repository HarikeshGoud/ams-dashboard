import { useState, useEffect } from 'react'
import api from '../../api/axios'
import SearchableSelect from '../../components/SearchableSelect'
import { formatISTDate, formatISTTime } from '../../utils/istTime'

function batchLabel(b) {
  return `${b.batch_no} — ${b.qty_office} left (received ${b.received_date})`
}

export default function MyStock() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('in-hand')   // in-hand | received | installed
  const [modal, setModal]     = useState(null)        // 'return' | 'install'
  const [items, setItems]     = useState([])
  const [schools, setSchools] = useState([])
  const [form, setForm]       = useState({ item_id: '', batch_id: '', quantity: 1, school_dest: '', note: '' })
  const [myBatches, setMyBatches] = useState([])
  const [toast, setToast]     = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([
      api.get('/api/stock/my-stock'),
      api.get('/api/stock/items'),
      api.get('/api/schools/?limit=200'),
    ]).then(([ms, it, sch]) => {
      setData(ms.data)
      setItems(it.data)
      setSchools(sch.data?.items || sch.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (modal && form.item_id) {
      api.get('/api/stock/employee-batches', { params: { item_id: form.item_id } }).then(r => {
        setMyBatches(r.data)
        if (r.data.length === 1) setForm(f => ({ ...f, batch_id: String(r.data[0].id) }))
      })
    } else { setMyBatches([]) }
  }, [modal, form.item_id])

  async function submitReturn(ev) {
    ev.preventDefault()
    if (!form.item_id) { showToast('❌ Select an item'); return }
    if (!form.batch_id) { showToast('❌ Select which batch you\'re returning'); return }
    try {
      await api.post('/api/stock/return', {
        item_id: parseInt(form.item_id),
        batch_id: parseInt(form.batch_id),
        quantity: parseInt(form.quantity),
        note: form.note || null
      })
      showToast('✅ Stock returned to office')
      setModal(null); load()
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  async function submitInstall(ev) {
    ev.preventDefault()
    if (!form.item_id) { showToast('❌ Select an item'); return }
    if (!form.batch_id) { showToast('❌ Select which batch you\'re installing from'); return }
    try {
      await api.post('/api/stock/install', {
        item_id: parseInt(form.item_id),
        batch_id: parseInt(form.batch_id),
        quantity: parseInt(form.quantity),
        school_dest: form.school_dest || null,
        note: form.note || null
      })
      showToast('✅ Installation recorded')
      setModal(null); load()
    } catch (e) { showToast('❌ ' + (e.response?.data?.detail || e.message)) }
  }

  if (loading) return <div className="spinner" />

  const inHand    = data?.in_hand    || []
  const received  = data?.received   || []
  const installed = data?.installed  || []
  const inHandItem = inHand.find(i => i.item_id === parseInt(form.item_id))
  const selectedBatch = myBatches.find(b => b.id === parseInt(form.batch_id))

  return (
    <div>
      <div className="section-header">
        <h3>🎒 My Stock</h3>
        <div className="flex gap-8">
          <button className="btn btn-outline" onClick={() => { setModal('return'); setForm({ item_id: '', batch_id: '', quantity: 1, note: '' }) }}>↩ Return to Office</button>
          <button className="btn btn-primary" onClick={() => { setModal('install'); setForm({ item_id: '', batch_id: '', quantity: 1, school_dest: '', note: '' }) }}>🔧 Mark Installed</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card blue">
          <div className="kpi-label">In My Possession</div>
          <div className="kpi-value">{inHand.reduce((s, i) => s + i.qty_in_hand, 0)}</div>
          <div className="kpi-sub">{inHand.length} item type{inHand.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Total Received</div>
          <div className="kpi-value">{received.reduce((s, i) => s + i.quantity, 0)}</div>
          <div className="kpi-sub">{received.length} distributions</div>
        </div>
        <div className="kpi-card yellow">
          <div className="kpi-label">Total Installed</div>
          <div className="kpi-value">{installed.reduce((s, i) => s + i.quantity, 0)}</div>
          <div className="kpi-sub">{installed.length} installations at sites</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'in-hand',   label: `🎒 In My Hand (${inHand.length})` },
          { key: 'received',  label: `📥 Received (${received.length})` },
          { key: 'installed', label: `🔧 Installed at Sites (${installed.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: tab === t.key ? 'var(--accent)' : 'var(--surface)', color: tab === t.key ? '#fff' : 'var(--text)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── IN HAND ─────────────────────────────────────────────── */}
      {tab === 'in-hand' && (
        <div className="card">
          {inHand.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontWeight: 600 }}>No stock in your possession</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Admin will distribute stock to you before your visits.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Item</th><th>Category</th><th>Unit</th><th>Qty in Hand</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {inHand.map(s => (
                    <tr key={s.item_id}>
                      <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                      <td><span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.category || '—'}</span></td>
                      <td>{s.unit}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent2)' }}>{s.qty_in_hand}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 4 }}>{s.unit}</span>
                      </td>
                      <td>
                        <div className="flex gap-6">
                          <button className="btn btn-primary btn-sm" onClick={() => { setModal('install'); setForm({ item_id: String(s.item_id), batch_id: '', quantity: 1, school_dest: '', note: '' }) }}>🔧 Install</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setModal('return'); setForm({ item_id: String(s.item_id), batch_id: '', quantity: 1, note: '' }) }}>↩ Return</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECEIVED ────────────────────────────────────────────── */}
      {tab === 'received' && (
        <div className="card">
          {received.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No distributions received yet</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Item</th><th>Qty Received</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {received.map(e => (
                    <tr key={e.id}>
                      <td>{formatISTDate(e.created_at)}</td>
                      <td style={{ fontWeight: 500 }}>{e.item_name}</td>
                      <td><b style={{ color: 'var(--green)' }}>+{e.quantity}</b> {e.item_unit}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INSTALLED ───────────────────────────────────────────── */}
      {tab === 'installed' && (
        <div className="card">
          {installed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No installations recorded yet</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date &amp; Time</th><th>Item</th><th>Qty</th><th>School / Site</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {installed.map(e => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontSize: 12 }}>{formatISTDate(e.created_at)}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatISTTime(e.created_at)}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{e.item_name}</td>
                      <td><b style={{ color: 'var(--accent2)' }}>{e.quantity}</b> {e.item_unit}</td>
                      <td style={{ fontSize: 12 }}>{e.school_dest || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────── */}

      {/* Return Stock */}
      {modal === 'return' && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>↩ Return Stock to Office</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Unused stock will be returned and added back to the office inventory.</p>
            <form onSubmit={submitReturn}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Item *</label>
                  <SearchableSelect value={form.item_id} onChange={val => setForm({...form, item_id: val, batch_id: ''})}
                    placeholder="Select item…"
                    options={inHand.map(s => ({ value: String(s.item_id), label: `${s.item_name} — ${s.qty_in_hand} ${s.unit} in hand` }))} />
                </div>
                {inHandItem && (
                  <div className="form-group form-full">
                    <div style={{ background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      You have <b style={{ color: 'var(--green)' }}>{inHandItem.qty_in_hand} {inHandItem.unit}</b> in hand
                    </div>
                  </div>
                )}
                <div className="form-group form-full"><label>Batch *</label>
                  {myBatches.length === 1 ? (
                    <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                      {batchLabel(myBatches[0])} <span style={{ color: 'var(--accent)' }}>(only batch — auto-selected)</span>
                    </div>
                  ) : (
                    <SearchableSelect value={form.batch_id} onChange={val => setForm({...form, batch_id: val})}
                      placeholder={form.item_id ? 'Select batch…' : 'Select an item first'}
                      options={myBatches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
                  )}
                </div>
                <div className="form-group"><label>Quantity to Return *</label>
                  <input required type="number" min="1" max={selectedBatch?.qty_office || 0} value={form.quantity}
                    onChange={e => setForm({...form, quantity: e.target.value})} />
                </div>
                <div className="form-group"><label>Note</label>
                  <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Reason for return..." />
                </div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-outline">↩ Return</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Installed */}
      {modal === 'install' && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🔧 Mark Stock as Installed</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Record that you installed this stock at a school/site. It will be deducted from your in-hand quantity.</p>
            <form onSubmit={submitInstall}>
              <div className="form-grid">
                <div className="form-group form-full"><label>Item *</label>
                  <SearchableSelect value={form.item_id} onChange={val => setForm({...form, item_id: val, batch_id: ''})}
                    placeholder="Select item…"
                    options={inHand.map(s => ({ value: String(s.item_id), label: `${s.item_name} — ${s.qty_in_hand} ${s.unit} in hand` }))} />
                </div>
                {inHandItem && (
                  <div className="form-group form-full">
                    <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      In hand: <b style={{ color: 'var(--accent2)' }}>{inHandItem.qty_in_hand} {inHandItem.unit}</b>
                    </div>
                  </div>
                )}
                <div className="form-group form-full"><label>Batch *</label>
                  {myBatches.length === 1 ? (
                    <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, color: 'var(--muted)' }}>
                      {batchLabel(myBatches[0])} <span style={{ color: 'var(--accent)' }}>(only batch — auto-selected)</span>
                    </div>
                  ) : (
                    <SearchableSelect value={form.batch_id} onChange={val => setForm({...form, batch_id: val})}
                      placeholder={form.item_id ? 'Select batch…' : 'Select an item first'}
                      options={myBatches.map(b => ({ value: String(b.id), label: batchLabel(b) }))} />
                  )}
                </div>
                <div className="form-group"><label>Quantity Installed *</label>
                  <input required type="number" min="1" max={selectedBatch?.qty_office || 0} value={form.quantity}
                    onChange={e => setForm({...form, quantity: e.target.value})} />
                </div>
                <div className="form-group form-full"><label>School / Site</label>
                  <SearchableSelect value={form.school_dest} onChange={val => setForm({...form, school_dest: val})}
                    placeholder="— Select School —"
                    options={schools.map(s => ({ value: s.name, label: s.name }))} />
                </div>
                <div className="form-group form-full"><label>Note</label>
                  <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="What was installed..." />
                </div>
              </div>
              <div className="mt-16 flex gap-8">
                <button type="submit" className="btn btn-primary">🔧 Mark Installed</button>
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
