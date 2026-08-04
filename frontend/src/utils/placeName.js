// Turn a GPS fix into a human place name — "Dharmojiguda, Jothinagar, Choutuppal mandal".
//
// Why this exists: the satellite view shows where a technician is but not WHAT it is, and in
// these villages no free basemap can fill that in. The tile at one technician's location is
// ~5 KB of OpenStreetMap data versus ~23 KB in a properly mapped town — the landmark names
// simply aren't in the data, so no amount of restyling will draw them.
//
// Reverse geocoding sidesteps that entirely. Nominatim knows the hamlet, village and mandal
// for any coordinate in India, which is the answer to "where is he?" that deskwork actually
// needs, and it works even where nothing has been traced onto the map.
//
// Nominatim asks for at most 1 request/second and no bulk querying, so this queues requests,
// spaces them out, and caches hard: 21 technicians must not become 21 simultaneous calls.

const CACHE_KEY = 'shc_place_cache'
const MIN_GAP_MS = 1200          // Nominatim's usage policy is 1 req/sec; leave headroom
const PRECISION = 4              // ~11 m — finer than this just fragments the cache

let cache = {}
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { cache = {} }

const inFlight = new Map()
let queueTail = Promise.resolve()
let lastCallAt = 0

function keyFor(lat, lng) {
  return `${lat.toFixed(PRECISION)},${lng.toFixed(PRECISION)}`
}

function persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* full or private */ }
}

// Prefer the smallest named thing, then widen — a hamlet name is far more useful to a
// dispatcher than "Telangana".
function shorten(data) {
  const a = data?.address || {}
  const parts = [
    a.hamlet || a.neighbourhood || a.suburb || a.village || a.town || a.city,
    a.village && a.village !== (a.hamlet || a.neighbourhood || a.suburb) ? a.village : null,
    a.county,                                  // "Choutuppal mandal"
  ].filter(Boolean)
  const seen = new Set()
  const uniq = parts.filter(p => !seen.has(p) && seen.add(p))
  if (uniq.length) return uniq.slice(0, 3).join(', ')
  return (data?.display_name || '').split(',').slice(0, 3).join(', ') || null
}

/**
 * Place name for a coordinate, or null if it can't be resolved.
 * Cached across sessions; never throws; never fires more than one request at a time.
 */
export function lookupPlace(lat, lng) {
  if (lat == null || lng == null) return Promise.resolve(null)
  const key = keyFor(lat, lng)
  if (key in cache) return Promise.resolve(cache[key])
  if (inFlight.has(key)) return inFlight.get(key)

  // Chain onto the queue so calls are spaced regardless of how many arrive at once.
  const p = (queueTail = queueTail.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCallAt))
    if (wait) await new Promise(r => setTimeout(r, wait))
    lastCallAt = Date.now()
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
                  `&format=json&zoom=18&addressdetails=1`
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) throw new Error(String(res.status))
      const name = shorten(await res.json())
      cache[key] = name          // cache nulls too, so a blank area isn't retried forever
      persist()
      return name
    } catch {
      return null                // NOT cached — a network blip should be retryable
    } finally {
      inFlight.delete(key)
    }
  }))

  inFlight.set(key, p)
  return p
}
