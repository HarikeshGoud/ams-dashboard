import L from 'leaflet'
import {
  MAPBOX_TOKEN, mapboxEnabled, countMapboxTile, reportMapboxTileError, onMapboxDisabled,
} from './mapboxQuota'

// Basemaps for every Leaflet map in the app, with a layer switcher.
//
// Why this exists: the maps looked empty — no buildings, no shop or landmark names. The
// cause was mostly ZOOM, not the tile provider. The standard OpenStreetMap style only draws
// buildings from z16 and POI names from z17, and Live Tracking capped itself at z14, so it
// could never show them. OSM genuinely has the data here: within 500 m of one technician's
// GPS fix there are 31 mapped buildings and 19 named places (hospitals, temples, shops).
//
// Worth knowing before swapping providers: Mapbox, MapTiler, CARTO, Stadia and Thunderforest
// all render OpenStreetMap data. They restyle it — they don't add missing content. Only
// providers with their own survey data differ, which in India means Google, HERE, or
// satellite imagery. That's why SATELLITE is offered here: it shows every building that
// physically exists, whether or not anyone has traced it into OSM.
//
// Every URL below was checked against a real tile covering a technician's location before
// being added — an overlay that returns a blank 116-byte tile is worse than none.

const OSM_ATTR   = '© OpenStreetMap contributors'
const ESRI_ATTR  = 'Imagery © Esri, Maxar, Earthstar Geographics'
const STORE_KEY  = 'shc_basemap'

// The free layers all top out well before this, but they're allowed up to it and upscaled past
// their real ceiling (see maxNativeZoom below) so zooming in softens the image instead of
// hitting a grey wall. Mapbox satellite has genuine detail this deep, which is the actual
// reason to pay for it.
export const MAX_ZOOM = 22

// Mapbox is opt-in: set VITE_MAPBOX_TOKEN and its layers appear automatically, becoming the
// default. Left unset, nothing about the map changes. Metering and the automatic fallback to
// the free layers live in ./mapboxQuota — nothing here has to think about the bill.
const FREE_DEFAULT = 'Satellite + street names'
const MAPBOX_DEFAULT = 'Mapbox Satellite'

// Mapbox serves 512px tiles, hence tileSize/zoomOffset.
function mapboxLayer(styleId) {
  const layer = L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
    { attribution: '© Mapbox © OpenStreetMap', tileSize: 512, zoomOffset: -1, maxZoom: MAX_ZOOM }
  )
  // Every rendered tile is a billed request, so it is counted where it actually happens rather
  // than estimated from map moves.
  layer.on('tileload', countMapboxTile)
  layer.on('tileerror', reportMapboxTileError)
  return layer
}

function buildLayers() {
  // maxNativeZoom on each free layer is the zoom past which the provider has nothing. OSM
  // stops at 19; Esri has no imagery beyond 18 over these villages — every z19 tile there came
  // back as an identical 2,521-byte "Map data not yet available" placeholder, which is what
  // turned the whole map grey. Capping the REQUEST and letting Leaflet upscale keeps it usable.
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: OSM_ATTR, maxZoom: MAX_ZOOM, maxNativeZoom: 19,
  })

  // Esri's own imagery, not OSM-derived — this is what actually reveals buildings that
  // nobody has mapped yet, which is most of them outside the towns.
  const imagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: ESRI_ATTR, maxZoom: MAX_ZOOM, maxNativeZoom: 18 })

  // A previous version offered "Satellite + labels" using Esri's Reference/World_Transportation
  // and World_Boundaries_and_Places overlays. Both return 872-byte near-empty tiles over these
  // villages, so it promised labels and delivered none. Removed rather than left misleading.
  //
  // This is the honest replacement: real imagery with the OSM street layer faded over it. OSM
  // is the only free source that carries village and landmark names here, and its tiles have
  // opaque land fill, so it has to be transparent enough to see the ground through.
  const streetsFaded = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: OSM_ATTR, maxZoom: MAX_ZOOM, maxNativeZoom: 19, opacity: 0.45,
  })

  const layers = {
    'Satellite': imagery,
    'Satellite + street names': L.layerGroup([imagery, streetsFaded]),
    'Streets': streets,
    'Streets (Esri)': L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: ESRI_ATTR, maxZoom: MAX_ZOOM, maxNativeZoom: 18 }),
  }

  if (mapboxEnabled()) {
    // Satellite-streets carries Mapbox's own imagery with labels burnt in, and has real detail
    // past Esri's z18 ceiling — the one thing a paid provider genuinely adds here.
    layers[MAPBOX_DEFAULT] = mapboxLayer('satellite-streets-v12')
    layers['Mapbox Streets'] = mapboxLayer('streets-v12')
  }

  return layers
}

/**
 * Add the basemaps and a layer switcher to a Leaflet map.
 * Remembers the operator's choice, so picking Satellite once keeps it across pages.
 *
 * @param {L.Map} map
 * @param {string} freeFallback  free layer to use when nothing is remembered, and to fall back
 *                               to if Mapbox gets disabled mid-session
 * @param {{onNotice?: (reason: string) => void}} [opts]  told when Mapbox is dropped, so the
 *                               page can say why the map just changed instead of it looking
 *                               like a glitch
 */
export function attachBasemaps(map, freeFallback = FREE_DEFAULT, opts = {}) {
  const layers = buildLayers()
  let chosen = null
  try { chosen = localStorage.getItem(STORE_KEY) } catch { /* private mode */ }
  // A remembered name can disappear — the Mapbox token was removed, or the budget ran out
  // since it was saved — so it's only honoured if that layer still exists.
  const preferred = layers[MAPBOX_DEFAULT] ? MAPBOX_DEFAULT : freeFallback
  const initial = (chosen && layers[chosen]) ? chosen
                : (layers[preferred] ? preferred : 'Streets')

  layers[initial].addTo(map)
  const control = L.control.layers(layers, {}, { position: 'topright', collapsed: true }).addTo(map)

  // The swap itself. Mapbox can run out mid-pan, so this has to move the LIVE layer, not just
  // stop offering it on the next page load.
  const unsubscribe = onMapboxDisabled(reason => {
    const freeName = layers[freeFallback] ? freeFallback : 'Streets'
    let wasShowing = false
    Object.keys(layers).filter(n => n.startsWith('Mapbox')).forEach(name => {
      const layer = layers[name]
      if (map.hasLayer(layer)) { map.removeLayer(layer); wasShowing = true }
      control.removeLayer(layer)
      delete layers[name]
    })
    if (wasShowing) {
      layers[freeName].addTo(map)
      // Remember the free layer too, so the next page load doesn't start on a dead choice.
      try { localStorage.setItem(STORE_KEY, freeName) } catch { /* ignore */ }
    }
    if (opts.onNotice) opts.onNotice(reason)
  })

  map.on('baselayerchange', e => {
    try { localStorage.setItem(STORE_KEY, e.name) } catch { /* ignore */ }
  })
  map.on('unload', unsubscribe)

  return layers
}

// Zooms at which detail actually appears, so no caller has to remember the thresholds:
// buildings from 16, POI names from 17.
export const ZOOM = {
  BUILDINGS: 16,
  LABELS: 17,
  SINGLE_TARGET: 18,   // centring on one technician or one site
}
