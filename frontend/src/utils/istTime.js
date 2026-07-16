// The backend stores timestamps with datetime.utcnow() and serializes them without a
// timezone marker (e.g. "2026-07-16T15:47:19"). JS treats a marker-less date-time string
// as local time rather than UTC, so on an IST device it renders 5:30 early. Every read of
// a server *_at/*_date field for display must go through here instead of new Date(raw)
// directly, and every "today" default must go through todayIST() instead of
// new Date().toISOString().slice(0,10) (which rolls back a day between 12:00-5:30am IST).

function toUTCDate(raw) {
  if (!raw) return null
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
  const d = new Date(hasTZ ? raw : raw + 'Z')
  return isNaN(d.getTime()) ? null : d
}

export function formatISTDate(raw) {
  const d = toUTCDate(raw)
  if (!d) return '—'
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // en-CA => YYYY-MM-DD
}

export function formatISTTime(raw) {
  const d = toUTCDate(raw)
  if (!d) return '—'
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

export function formatISTDateTime(raw, opts) {
  const d = toUTCDate(raw)
  if (!d) return '—'
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...(opts || { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
}

// Today's calendar date in IST, as "YYYY-MM-DD" — for date-picker defaults and
// today-vs-due comparisons. Never round-trips through UTC.
export function todayIST() {
  const now = new Date()
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function yesterdayIST() {
  const [y, m, d] = todayIST().split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}
