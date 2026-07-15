import { useState, useEffect } from 'react'
import api from '../../api/axios'
import CameraCapture from '../../components/CameraCapture'
import SearchableSelect from '../../components/SearchableSelect'

const STATUS_CFG = {
  pending:  { label: '⏳ Pending Review', color: 'var(--yellow)', bg: 'rgba(251,191,36,.1)' },
  approved: { label: '✅ Approved',       color: 'var(--green)',  bg: 'rgba(52,211,153,.1)' },
  rejected: { label: '❌ Rejected',       color: 'var(--red)',    bg: 'rgba(248,113,113,.1)' },
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function reimbursementLabel(p) {
  if (p.status !== 'approved') return null
  if (p.reimbursement_status === 'paid_separately') return { text: '💰 Repaid', color: 'var(--green)' }
  if (p.reimbursement_status === 'added_to_salary') return { text: `💰 Added to ${MONTHS[p.reimbursed_month]} ${p.reimbursed_year} salary`, color: 'var(--green)' }
  return { text: '💰 Repayment Pending', color: 'var(--yellow)' }
}

function LogPurchaseModal({ onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [stockItems, setStockItems] = useState([])
  const [itemId, setItemId] = useState('')
  const [customName, setCustomName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [amountPaid, setAmountPaid] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [billPhoto, setBillPhoto] = useState(null)
  const [billPreview, setBillPreview] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/stock/items').then(r => setStockItems(r.data || [])).catch(() => setStockItems([]))
  }, [])

  function handleCaptured(file, url) {
    setBillPhoto(file)
    setBillPreview(url)
    setShowCamera(false)
  }

  async function submit() {
    if (!itemId) { setError('Select an item'); return }
    if (itemId === '__other__' && !customName.trim()) { setError('Type the item name'); return }
    if (!quantity || Number(quantity) <= 0) { setError('Enter a valid quantity'); return }
    if (!amountPaid || Number(amountPaid) <= 0) { setError('Enter the amount paid'); return }
    if (!billPhoto) { setError('Upload the purchase bill as proof'); return }

    setLoading(true); setError('')
    try {
      const fd = new FormData()
      if (itemId !== '__other__') fd.append('item_id', itemId)
      else fd.append('item_name', customName.trim())
      fd.append('quantity', quantity)
      fd.append('amount_paid', amountPaid)
      fd.append('purchase_date', purchaseDate)
      fd.append('bill_photo', billPhoto)

      await api.post('/api/stock-purchases/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSaved()
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to log purchase')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🛒 Log a Purchase</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Bought an item yourself because you didn't have it in hand? Log it here for admin approval and reimbursement.
        </p>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Item *</label>
          <SearchableSelect value={itemId} onChange={setItemId} placeholder="Select item…"
            options={[
              ...stockItems.map(s => ({ value: String(s.id), label: s.name })),
              { value: '__other__', label: 'Other (type manually)' },
            ]} />
        </div>

        {itemId === '__other__' && (
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Item Name *</label>
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Type what you bought…" />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Quantity *</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Amount Paid (₹) *</label>
            <input type="number" min="0" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Purchase Date</label>
          <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Bill / Receipt Photo *</label>
          {billPreview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={billPreview} alt="bill" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCamera(true)}>Retake</button>
            </div>
          ) : (
            <button type="button" className="btn btn-outline" style={{ width: '100%' }} onClick={() => setShowCamera(true)}>
              📷 Open Camera — Take Bill Photo
            </button>
          )}
        </div>

        {showCamera && (
          <CameraCapture
            gps={null}
            siteName={null}
            showGps={false}
            onCapture={handleCaptured}
            onClose={() => setShowCamera(false)}
          />
        )}

        {error && <div className="alert alert-red" style={{ marginBottom: 12 }}><span>⚠️</span><div>{error}</div></div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={loading}>
            {loading ? '⏳ Submitting…' : '🛒 Submit Purchase'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function PurchasedStock() {
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    api.get('/api/stock-purchases/')
      .then(r => { setPurchases(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totalSpent = purchases.reduce((s, p) => s + p.amount_paid, 0)
  const approvedCount = purchases.filter(p => p.status === 'approved').length

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h3>🛒 Purchased Stock</h3>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => setShowForm(true)}>
          + Log Purchase
        </button>
      </div>

      {purchases.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            ['📋 Total Logged', purchases.length,                            'var(--accent)'],
            ['💸 Total Spent',  `₹${totalSpent.toLocaleString('en-IN')}`,     'var(--yellow)'],
            ['✅ Approved',     approvedCount,                               'var(--green)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="spinner" /> : purchases.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No purchases logged</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>Log stock you bought yourself when you didn't have it in hand</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Log First Purchase</button>
        </div>
      ) : (
        purchases.map(p => {
          const sc = STATUS_CFG[p.status] || STATUS_CFG.pending
          const reimb = reimbursementLabel(p)
          return (
            <div key={p.id} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.item_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {p.quantity} unit{p.quantity > 1 ? 's' : ''} &nbsp;·&nbsp; 📅 {p.purchase_date}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 8, background: sc.bg, color: sc.color, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                  {sc.label}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {p.bill_photo_url && (
                  <a href={p.bill_photo_url} target="_blank" rel="noreferrer">
                    <img src={p.bill_photo_url} alt="bill" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  </a>
                )}
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent2)' }}>
                  ₹{p.amount_paid.toLocaleString('en-IN')}
                </div>
              </div>

              {reimb && (
                <div style={{ fontSize: 11, fontWeight: 700, color: reimb.color, marginTop: 8 }}>
                  {reimb.text}
                </div>
              )}

              {p.admin_note && (
                <div style={{ fontSize: 11, color: sc.color, marginTop: 8, background: sc.bg, padding: '5px 10px', borderRadius: 6 }}>
                  📝 {p.admin_note}
                </div>
              )}
            </div>
          )
        })
      )}

      {showForm && (
        <LogPurchaseModal
          onClose={() => setShowForm(false)}
          onSaved={() => { load(); showToast('✅ Purchase logged — awaiting admin approval') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
