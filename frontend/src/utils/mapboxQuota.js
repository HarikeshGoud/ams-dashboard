// Mapbox is metered. OpenStreetMap and Esri are not. This module is what keeps a better-looking
// map from quietly turning into a bill.
//
// Two guards, because the two failure modes are different:
//
//   1. A COUNTER, which acts BEFORE any money is spent. Every Mapbox tile the browser loads is
//      counted against a monthly budget held in localStorage. When the budget is gone, Mapbox
//      stops being offered for the rest of the calendar month and the map falls back to the
//      free layers on its own.
//
//   2. A CIRCUIT BREAKER, for when the counter's estimate was wrong. If Mapbox tiles start
//      failing, one probe request reads the real HTTP status: 429 means the account has hit its
//      limit, 401/403 means the token is bad or URL-restricted. Either disables Mapbox for the
//      month. Anything else is treated as a network blip and Mapbox is left alone, so flaky
//      village signal doesn't cost the good basemap for three weeks.
//
// The counter is PER BROWSER, not per account. A browser cannot read account-level usage —
// that needs a secret token, which must never ship to a client — so the budget below is the
// account's free tier divided across the expected number of dashboard users, with headroom.
// It is an estimate, and deliberately a pessimistic one.
//
// It is NOT a spending guarantee, and nothing written in frontend code could be. The only hard
// guarantee lives in the Mapbox account itself: keep no card on file, or set a spending limit.
// This module's job is to make hitting the limit a non-event rather than a surprise.

const STORE_KEY = 'shc_mapbox_quota'

// A pk.* token is public by design — it ends up in the JS bundle no matter how it is stored, so
// there is nothing to hide here. What protects it is the URL restriction set on it in the Mapbox
// dashboard, which stops anyone lifting it from the bundle and spending the quota.
//
// Vite inlines this at BUILD time, so the token only takes effect after a redeploy. If it ever
// appears not to have taken: check the .env file has no UTF-8 BOM. A BOM silently voids the
// FIRST variable in the file — the key parses as "﻿VITE_MAPBOX_TOKEN" and never matches —
// while every later line loads fine, which makes it look like the code is ignoring the token.
// PowerShell 5.1's `Set-Content -Encoding utf8` writes one; `[System.IO.File]::WriteAllText`
// with `UTF8Encoding $false` does not.
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Mapbox's free allowance for the Static/Raster Tiles API, which is what L.tileLayer hits:
// 200,000 tile requests per calendar month, then $0.50 per 1,000. Checked Aug 2026 — worth
// re-checking, since it is the number the budget below is derived from.
export const MAPBOX_FREE_TIER = 200000

// Divided across the people who open the dashboard, with headroom. Around ten users means a
// 12,000-tile per-browser budget keeps the account near 120,000 — inside the free tier even
// if two or three of them use the map far more than the rest. Raise or lower it with
// VITE_MAPBOX_MONTHLY_TILES when the user count changes materially.
const BUDGET = Number(import.meta.env.VITE_MAPBOX_MONTHLY_TILES) || 12000

// Mapbox bills by calendar month, so the counter resets on the same boundary. UTC, because a
// local-time month boundary would reset early or late depending on the operator's timezone.
function monthKey() {
  return new Date().toISOString().slice(0, 7)   // "2026-08"
}

let state = { month: monthKey(), tiles: 0, off: null }
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
  // A saved month that isn't this one is simply ignored, which is what resets the counter —
  // and clears `off`, so a new month restores Mapbox without anyone having to do anything.
  if (saved && saved.month === state.month) state = { ...state, ...saved }
} catch { /* private mode, or corrupt value */ }

const listeners = new Set()

/** Called when Mapbox is dropped. Returns an unsubscribe function. */
export function onMapboxDisabled(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Panning a map fires tileload dozens of times a second. A synchronous localStorage write per
// tile would visibly stutter the pan, so writes are batched — and flushed on pagehide so a
// closed tab doesn't lose its count.
let flushTimer = null
function write() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}
function persist(immediate = false) {
  if (immediate) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    write()
    return
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; write() }, 3000)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => persist(true))
}

export function disableMapbox(reason) {
  if (state.off) return
  state.off = reason
  persist(true)
  console.warn(`[mapbox] disabled for ${state.month}: ${reason}`)
  listeners.forEach(fn => { try { fn(reason) } catch { /* a bad listener isn't fatal */ } })
}

export function mapboxEnabled() {
  return Boolean(MAPBOX_TOKEN) && !state.off && state.tiles < BUDGET
}

export function countMapboxTile() {
  state.tiles += 1
  if (state.tiles >= BUDGET) {
    disableMapbox(`Mapbox tile budget for this month is used up (${BUDGET.toLocaleString()} ` +
                  `tiles on this browser) — switched to OpenStreetMap and Esri`)
    return
  }
  persist()
}

// tileerror fires for any image that fails, including a single tile Mapbox genuinely doesn't
// have at that zoom. One error is not a quota signal, so wait for a cluster before spending a
// request to find out what is actually wrong.
const ERROR_THRESHOLD = 6
const ERROR_WINDOW_MS = 10000
let errorsInWindow = 0
let windowStartedAt = 0
let probing = false

export function reportMapboxTileError() {
  if (state.off || probing) return
  const now = Date.now()
  if (now - windowStartedAt > ERROR_WINDOW_MS) { windowStartedAt = now; errorsInWindow = 0 }
  if (++errorsInWindow < ERROR_THRESHOLD) return
  errorsInWindow = 0
  probeMapbox()
}

// Leaflet's tileerror carries no HTTP status — an <img> onerror never does — so the status has
// to be fetched deliberately. This is the whole reason the breaker can tell "out of quota" from
// "the wifi dropped", which is the difference between disabling Mapbox for three weeks and
// disabling it for nothing.
async function probeMapbox() {
  probing = true
  try {
    // The z1 tile always exists and is a couple of KB. Costs one request to ask.
    const res = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/1/0/0?access_token=${MAPBOX_TOKEN}`,
      { cache: 'no-store' })
    countMapboxTile()
    if (res.status === 429) {
      disableMapbox('Mapbox monthly free limit reached — switched to OpenStreetMap and Esri')
    } else if (res.status === 401 || res.status === 403) {
      disableMapbox('Mapbox rejected the access token — check VITE_MAPBOX_TOKEN and the URL ' +
                    'restrictions set on it')
    }
    // Any other status, 200 included: those tile errors were something else. Leave Mapbox on.
  } catch {
    // Network unreachable. Not Mapbox's doing, and not a reason to give up the basemap.
  } finally {
    probing = false
  }
}

/** Snapshot for the UI: whether Mapbox is configured, live, and how much budget is left. */
export function mapboxStatus() {
  return {
    configured: Boolean(MAPBOX_TOKEN),
    active: mapboxEnabled(),
    reason: state.off,
    tiles: state.tiles,
    budget: BUDGET,
    month: state.month,
  }
}
