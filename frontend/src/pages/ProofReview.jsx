import { useState, useEffect } from 'react'
import api from '../api/axios'
import SearchableSelect from '../components/SearchableSelect'
import { formatISTDate, formatISTDateTime } from '../utils/istTime'

const STATUS_CONFIG = {
  pending:  { label: 'Awaiting Verification', color: 'var(--yellow)',  bg: 'rgba(251,191,36,.12)',  icon: '⏳' },
  verified: { label: 'Verified',              color: 'var(--green)',   bg: 'rgba(52,211,153,.12)',  icon: '✅' },
  rejected: { label: 'Rejected',              color: 'var(--red)',     bg: 'rgba(248,113,113,.12)', icon: '❌' },
}

function VerifyModal({ report, onClose, onDone }) {
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!status) return
    setLoading(true)
    await api.patch(`/api/field-reports/${report.id}/verify`, { status, note })
    onDone()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target.className === 'modal-backdrop' && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Update Verification</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Did the school confirm this work was completed?
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {['verified', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              flex: 1, padding: '14px 8px', borderRadius: 10, fontWeight: 700,
              fontSize: 13, cursor: 'pointer', transition: 'all .15s',
              border: `2px solid ${status === s ? STATUS_CONFIG[s].color : 'var(--border)'}`,
              background: status === s ? STATUS_CONFIG[s].bg : 'var(--surface2)',
              color: status === s ? STATUS_CONFIG[s].color : 'var(--muted)'
            }}>
              {STATUS_CONFIG[s].icon} {s === 'verified' ? 'Confirmed ✓' : 'Rejected ✗'}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="e.g. School principal confirmed via call..." />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit}
            disabled={!status || loading}>
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ProofReview() {
  const [reports, setReports] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [verifyTarget, setVerifyTarget] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function load() {
    Promise.all([api.get('/api/field-reports/'), api.get('/api/employees/')]).then(([r, e]) => {
      setReports(r.data); setEmployees(e.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function sendWhatsApp(r) {
    const emp = employees.find(e => e.id === r.employee_id)
    const phone = r.school_phone?.replace(/\D/g, '')
    const date = r.report_date
    const time = formatISTDateTime(r.submitted_at, { hour: '2-digit', minute: '2-digit', hour12: true })
    const gps  = r.latitude ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}` : 'not captured'
    const work = r.item_installed || 'Maintenance visit'
    const school = r.school_name || 'your location'

    const msg = [
      `Dear ${r.school_contact || 'Sir/Madam'},`,
      ``,
      `This is to inform you that our technician *${emp?.name || 'Technician'}* (ID: ${emp?.employee_code || ''}) has completed the following work at *${school}*:`,
      ``,
      `📅 Date: ${date}  🕐 Time: ${time}`,
      `🔧 Work done: ${work}`,
      `📍 GPS Location: ${gps}`,
      ``,
      `Kindly reply *CONFIRM* if the work was completed satisfactorily, or *REJECT* with reason if not.`,
      ``,
      `Thank you,`,
      `SHC Dashboard — Water Purifier Management`
    ].join('\n')

    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`

    window.open(url, '_blank')

    // Mark whatsapp as sent
    await api.patch(`/api/field-reports/${r.id}/whatsapp-sent`)
    load()
    showToast('WhatsApp message opened. Mark verified once school confirms.')
  }

  function mapsLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  const filtered = reports
    .filter(r => !filterEmp || r.employee_id === parseInt(filterEmp))
    .filter(r => !filterStatus || r.verification_status === filterStatus)

  const counts = {
    pending:  reports.filter(r => r.verification_status === 'pending').length,
    verified: reports.filter(r => r.verification_status === 'verified').length,
    rejected: reports.filter(r => r.verification_status === 'rejected').length,
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="section-header">
        <h3>📸 Proof Review & Verification</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} submissions</span>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([s, n]) => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: `1.5px solid ${filterStatus === s ? STATUS_CONFIG[s].color : 'var(--border)'}`,
            background: filterStatus === s ? STATUS_CONFIG[s].bg : 'var(--surface)',
            color: filterStatus === s ? STATUS_CONFIG[s].color : 'var(--muted)'
          }}>
            {STATUS_CONFIG[s].icon} {s.charAt(0).toUpperCase() + s.slice(1)}: {n}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <SearchableSelect value={filterEmp} onChange={setFilterEmp} placeholder="All Employees"
          options={employees.map(e => ({ value: String(e.id), label: `${e.name} [${e.employee_code}]` }))}
          style={{ minWidth: 220 }} />
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          No submissions found.
        </div>
      )}

      {filtered.map(r => {
        const emp = employees.find(e => e.id === r.employee_id)
        const vs = STATUS_CONFIG[r.verification_status] || STATUS_CONFIG.pending
        return (
          <div key={r.id} className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${vs.color}` }}>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  👤 {emp?.name || `Employee #${r.employee_id}`}
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                    [{emp?.employee_code}]
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  📅 {r.report_date} &nbsp;·&nbsp; ⏰ {formatISTDateTime(r.submitted_at, { hour: '2-digit', minute: '2-digit', hour12: true })}
                  {r.school_name && <span> &nbsp;·&nbsp; 🏫 {r.school_name}</span>}
                </div>
                {r.item_installed && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>🔧 <b>{r.item_installed}</b></div>
                )}
              </div>
              {/* Verification badge */}
              <div style={{
                background: vs.bg, border: `1px solid ${vs.color}`,
                borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700,
                color: vs.color, whiteSpace: 'nowrap'
              }}>
                {vs.icon} {vs.label}
              </div>
            </div>

            {/* GPS */}
            {r.latitude ? (
              <a href={mapsLink(r.latitude, r.longitude)} target="_blank" rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)',
                  borderRadius: 8, padding: '5px 10px', fontSize: 11, color: 'var(--green)',
                  textDecoration: 'none', marginBottom: 12, fontWeight: 600
                }}>
                📍 {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)} — View on Maps
              </a>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12 }}>⚠️ No GPS data</div>
            )}

            {/* Photos */}
            {r.photos?.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {r.photos.map(p => (
                  <div key={p.id} style={{ cursor: 'pointer' }} onClick={() => setLightbox(p)}>
                    <div style={{ position: 'relative' }}>
                      <img src={p.url} alt={p.photo_type}
                        style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 10, border: '2px solid var(--border)', display: 'block' }} />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 9, fontWeight: 700,
                        textAlign: 'center', padding: '3px 0', borderRadius: '0 0 10px 10px',
                        textTransform: 'uppercase'
                      }}>{p.photo_type}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {r.remarks && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>💬 {r.remarks}</div>
            )}

            {/* Verification note */}
            {r.verification_note && (
              <div style={{
                fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                background: vs.bg, color: vs.color
              }}>
                📝 {r.verification_note}
                {r.verified_at && <span style={{ marginLeft: 8, opacity: 0.7 }}>— {formatISTDate(r.verified_at)} {formatISTDateTime(r.verified_at, { hour: '2-digit', minute: '2-digit', hour12: true })}</span>}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* WhatsApp */}
              <button onClick={() => sendWhatsApp(r)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#25D366', color: '#fff', border: 'none', borderRadius: 8,
                padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>
                <span style={{ fontSize: 16 }}>💬</span>
                {r.whatsapp_sent_at ? 'Resend WhatsApp' : 'Send WhatsApp to School'}
              </button>
              {r.whatsapp_sent_at && (
                <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
                  Sent {formatISTDate(r.whatsapp_sent_at)} {formatISTDateTime(r.whatsapp_sent_at, { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              )}

              {/* Verify / Reject */}
              <button onClick={() => setVerifyTarget(r)} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', color: 'var(--text)', marginLeft: 'auto'
              }}>
                ✏️ Update Verification
              </button>
            </div>
          </div>
        )
      })}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1600,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
        }}>
          <img src={lightbox.url} alt={lightbox.photo_type}
            style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10 }} />
          <div style={{ marginTop: 12, color: '#fff', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
            {lightbox.photo_type} photo
            {lightbox.latitude && ` · 📍 ${lightbox.latitude.toFixed(5)}, ${lightbox.longitude.toFixed(5)}`}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Click anywhere to close</div>
        </div>
      )}

      {/* Verify modal */}
      {verifyTarget && (
        <VerifyModal
          report={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onDone={() => { load(); showToast('Verification updated!') }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
