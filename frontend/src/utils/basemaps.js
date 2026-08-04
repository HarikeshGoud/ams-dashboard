import L from 'leaflet'

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

// Mapbox is opt-in: set VITE_MAPBOX_TOKEN and its layers appear automatically. Left unset,
// nothing about the map changes. Mapbox serves 512px tiles, hence the zoomOffset.
const MAPBOX_TOKEN = import.meta.env?.VITE_MAPBOX_TOKEN || ''

function mapboxLayer(styleId) {
  return L.tileLayer(
    `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
    { attribution: '© Mapbox © OpenStreetMap', tileSize: 512, zoomOffset: -1, maxZoom: 19 }
  )
}

function buildLayers() {
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: OSM_ATTR, maxZoom: 19,
  })

  // Esri's own imagery, not OSM-derived — this is what actually reveals buildings that
  // nobody has mapped yet, which is most of them outside the towns.
  //
  // maxNativeZoom matters: Esri has no z19 imagery over these villages. Every z19 tile
  // there comes back as an identical 2,521-byte "Map data not yet available" placeholder,
  // which is what turned the whole map grey. Capping the REQUEST at 18 and letting Leaflet
  // upscale keeps it usable past that instead.
  const imagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: ESRI_ATTR, maxZoom: 19, maxNativeZoom: 18 })

  // A previous version offered "Satellite + labels" using Esri's Reference/World_Transportation
  // and World_Boundaries_and_Places overlays. Both return 872-byte near-empty tiles over these
  // villages, so it promised labels and delivered none. Removed rather than left misleading.
  //
  // This is the honest replacement: real imagery with the OSM street layer faded over it. OSM
  // is the only free source that carries village and landmark names here, and its tiles have
  // opaque land fill, so it has to be transparent enough to see the ground through.
  const streetsFaded = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: OSM_ATTR, maxZoom: 19, opacity: 0.45,
  })

  const layers = {
    'Satellite': imagery,
    'Satellite + street names': L.layerGroup([imagery, streetsFaded]),
    'Streets': streets,
    'Streets (Esri)': L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: ESRI_ATTR, maxZoom: 19, maxNativeZoom: 18 }),
  }

  if (MAPBOX_TOKEN) {
    layers['Mapbox Streets'] = mapboxLayer('streets-v12')
    layers['Mapbox Satellite'] = mapboxLayer('satellite-streets-v12')
  }

  return layers
}

/**
 * Add the basemaps and a layer switcher to a Leaflet map.
 * Remembers the operator's choice, so picking Satellite once keeps it across pages.
 *
 * @param {L.Map} map
 * @param {string} fallback  layer name to use when nothing has been chosen yet
 */
export function attachBasemaps(map, fallback = 'Satellite + street names') {
  const layers = buildLayers()
  let chosen = null
  try { chosen = localStorage.getItem(STORE_KEY) } catch { /* private mode */ }
  // A remembered name can disappear — e.g. the Mapbox token was removed since.
  const initial = (chosen && layers[chosen]) ? chosen : (layers[fallback] ? fallback : 'Streets')

  layers[initial].addTo(map)
  L.control.layers(layers, {}, { position: 'topright', collapsed: true }).addTo(map)

  map.on('baselayerchange', e => {
    try { localStorage.setItem(STORE_KEY, e.name) } catch { /* ignore */ }
  })

  return layers
}

// Zooms at which detail actually appears, so no caller has to remember the thresholds:
// buildings from 16, POI names from 17.
export const ZOOM = {
  BUILDINGS: 16,
  LABELS: 17,
  SINGLE_TARGET: 18,   // centring on one technician or one site
}
