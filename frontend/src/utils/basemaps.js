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
  const imagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: ESRI_ATTR, maxZoom: 19 })

  // Roads and place names on a transparent background, so imagery stays readable underneath.
  const refRoads = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    { attribution: ESRI_ATTR, maxZoom: 19 })
  const refPlaces = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { attribution: ESRI_ATTR, maxZoom: 19 })

  const layers = {
    'Satellite + labels': L.layerGroup([imagery, refRoads, refPlaces]),
    'Satellite': imagery,
    'Streets': streets,
    'Streets (Esri)': L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: ESRI_ATTR, maxZoom: 19 }),
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
export function attachBasemaps(map, fallback = 'Satellite + labels') {
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
