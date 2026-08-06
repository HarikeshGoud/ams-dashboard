import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'

// Billing rates per item, per client — the page that decides what the consumption summary
// charges. Separate from Stock on purpose: the figure there is what a part COST to buy, and
// overwriting it with a selling price would erase the margin from the books.
//
// Rates are per client because the same part is billed differently under different contracts.
// An item with no rate stays blank rather than defaulting to cost price: a visible gap is
// better than quietly invoicing a customer at what the company paid.
const money = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export default function ItemRates() {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [data, setData] = useState(null)
  const [edits, setEdits] = useState({})     // item_id -> typed rate
  const [gst, setGst] = useState('18')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    api.get('/api/clients/')
      .then(r => setClients(r.data?.items || r.data || []))
      .catch(() => setClients([]))
  }, [])

  useEffect(() => {
    if (!clientId) { setData(null); return }
    setLoading(true); setError(''); setEdits({})
    api.get('/api/consumption/rates', { params: { client_id: Number(clientId) } })
      .then(r => { setData(r.data); setGst(String(r.data?.gst_percent ?? 18)) })
      .catch(e => { setError(e.response?.data?.detail || 'Could not load rates'); setData(null) })
      .finally(() => setLoading(false))
  }, [clientId])

  const rateOf = it => {
    const e = edits[it.item_id]
    return e !== undefined ? e : (it.rate == null ? '' : String(it.rate))
  }

  const grouped = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const items = q
      ? data.items.filter(i => (i.name || '').toLowerCase().includes(q)
                            || (i.category || '').toLowerCase().includes(q))
      : data.items
    const by = {}
    items.forEach(i => { (by[i.category || 'Uncategorised'] ||= []).push(i) })
    return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data, search])

  const dirty = Object.keys(edits).length > 0
  const missing = data ? data.items.filter(i => rateOf(i) === '').length : 0

  async function save() {
    if (!clientId) return
    // Only what was actually typed is sent, so an untouched blank stays unset rather than
    // being written as a zero rate that would look agreed.
    const rates = Object.entries(edits)
      .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
      .map(([item_id, v]) => ({ item_id: Number(item_id), rate: Number(v) }))
    setSaving(true); setError('')
    try {
      await api.post('/api/consumption/rates', {
        client_id: Number(clientId), rates, gst_percent: Number(gst) || 0,
      })
      const r = await api.get('/api/consumption/rates', { params: { client_id: Number(clientId) } })
      setData(r.data); setEdits({})
      showToast(`✅ Saved ${rates.length} rate${rates.length === 1 ? '' : 's'}`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not save rates')
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="section-header">
        <h3>💰 Item Rates</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          What each client is billed per unit — used by the Consumption Summary
        </span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 230 }}>
            <label style={{ fontSize: 10 }}>Client *</label>
            <SearchableSelect value={clientId} onChange={setClientId} placeholder="Select a client…"
              options={clients.map(c => ({ value: String(c.id), label: c.name }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
            <label style={{ fontSize: 10 }}>Default GST %</label>
            <input type="number" min="0" max="100" step="0.01" value={gst}
              onChange={e => setGst(e.target.value)} disabled={!clientId} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label style={{ fontSize: 10 }}>Find an item</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Name or category…" disabled={!clientId} />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={!clientId || saving || !dirty}>
            {saving ? '⏳ Saving…' : dirty ? `💾 Save ${Object.keys(edits).length} change${Object.keys(edits).length === 1 ? '' : 's'}` : '💾 Save'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>{error}</div>}

      {!clientId && (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--muted)' }}>
          Pick a client to set its rates. Each client has its own price list, so the same part can
          be billed differently under different contracts.
        </div>
      )}

      {loading && <div className="spinner" />}

      {data && !loading && (
        <>
          {missing > 0 && (
            <div className="alert alert-yellow" style={{ marginBottom: 12, display: 'block' }}>
              ⚠️ <b>{missing}</b> of {data.items.length} items have no rate for {data.client.name}.
              Those lines are priced at 0 on the summary until a rate is set here.
            </div>
          )}

          {grouped.map(([category, items]) => (
            <div className="card" style={{ marginBottom: 12 }} key={category}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>
                {category} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({items.length})</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th><th>Unit</th>
                      <th>Cost price</th>
                      <th style={{ width: 130 }}>Billed rate</th>
                      <th>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => {
                      const r = rateOf(it)
                      const margin = r === '' ? null : Number(r) - Number(it.unit_cost || 0)
                      return (
                        <tr key={it.item_id}>
                          <td style={{ fontWeight: 600 }}>{it.name}</td>
                          <td>{it.unit}</td>
                          {/* Shown only so a rate can be sanity-checked against it. Never billed. */}
                          <td style={{ color: 'var(--muted)' }}>{money(it.unit_cost)}</td>
                          <td>
                            <input type="number" min="0" step="0.01" value={r}
                              placeholder="not set"
                              onChange={e => setEdits(p => ({ ...p, [it.item_id]: e.target.value }))}
                              style={{
                                width: 112, fontSize: 12, padding: '4px 6px',
                                border: `1px solid ${r === '' ? 'var(--yellow)' : 'var(--border)'}`,
                              }} />
                          </td>
                          <td style={{
                            fontSize: 12, fontWeight: 700,
                            color: margin === null ? 'var(--muted)'
                                 : margin < 0 ? 'var(--red)' : 'var(--green)',
                          }}>
                            {margin === null ? '—' : `${margin < 0 ? '' : '+'}${money(margin)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
