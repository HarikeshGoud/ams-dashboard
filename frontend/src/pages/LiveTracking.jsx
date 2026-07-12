import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api/axios'

const POLL_MS = 15000
const RECENT_WINDOW_SECONDS = 900 // 15 min

function statusOf(entry) {
  if (!entry.updated_at) return { key: 'none',   label: '⚫ No data yet',  color: '#64748b' }
  if (entry.is_live)      return { key: 'live',   label: '🟢 Live',        color: '#22c55e' }
  if (entry.seconds_ago <= RECENT_WINDOW_SECONDS)
                          return { key: 'recent', label: '🟡 Recently seen', color: '#eab308' }
  return                       { key: 'stale',  label: '⚫ Offline',       color: '#64748b' }
}

function agoLabel(seconds) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function makeDivIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function LiveTracking() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({}) // employee_id -> L.marker
  const firstFitRef = useRef(false)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current, { center: [17.385, 78.486], zoom: 8 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)
    mapInstanceRef.current = map
    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  function load() {
    api.get('/api/locations/live')
      .then(res => {
        setEntries(res.data || [])
        setLastUpdated(new Date())
        setError('')
        setLoading(false)
        syncMarkers(res.data || [])
      })
      .catch(() => { setError('Could not load live locations.'); setLoading(false) })
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  function syncMarkers(data) {
    const map = mapInstanceRef.current
    if (!map) return
    const seenIds = new Set()
    const withLoc = data.filter(e => e.latitude != null && e.longitude != null)

    withLoc.forEach(e => {
      seenIds.add(e.employee_id)
      const { color } = statusOf(e)
      const popupHtml = `
        <div style="font-size:13px;min-width:160px">
          <div style="font-weight:700;margin-bottom:2px">${e.name}</div>
          <div style="color:#64748b;font-size:11px;margin-bottom:4px">${e.employee_code || ''} ${e.designation ? '· ' + e.designation : ''}</div>
          <div style="font-size:11px">Last seen: <b>${agoLabel(e.seconds_ago)}</b></div>
          ${e.accuracy ? `<div style="font-size:11px;color:#64748b">Accuracy: ±${Math.round(e.accuracy)}m</div>` : ''}
        </div>`

      let marker = markersRef.current[e.employee_id]
      if (marker) {
        marker.setLatLng([e.latitude, e.longitude])
        marker.setIcon(makeDivIcon(color))
        marker.setPopupContent(popupHtml)
      } else {
        marker = L.marker([e.latitude, e.longitude], { icon: makeDivIcon(color) })
          .bindTooltip(e.name, { permanent: true, direction: 'top', offset: [0, -10], className: 'tech-tooltip' })
          .bindPopup(popupHtml)
          .addTo(map)
        markersRef.current[e.employee_id] = marker
      }
    })

    // Remove markers for technicians no longer present (deactivated, etc.)
    Object.keys(markersRef.current).forEach(id => {
      if (!seenIds.has(Number(id))) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    if (!firstFitRef.current && withLoc.length > 0) {
      firstFitRef.current = true
      const bounds = L.latLngBounds(withLoc.map(e => [e.latitude, e.longitude]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    }
  }

  function locate(e) {
    if (e.latitude == null) return
    const map = mapInstanceRef.current
    map.setView([e.latitude, e.longitude], 15)
    markersRef.current[e.employee_id]?.openPopup()
  }

  const liveCount   = entries.filter(e => statusOf(e).key === 'live').length
  const recentCount = entries.filter(e => statusOf(e).key === 'recent').length

  return (
    <div>
      <div className="section-header">
        <h3>📍 Live Tracking</h3>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN')}` : ''} · auto-refresh every 15s
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ background: 'rgba(34,197,94,.12)', color: '#22c55e', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>🟢 {liveCount} Live</span>
        <span style={{ background: 'rgba(234,179,8,.12)', color: '#eab308', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>🟡 {recentCount} Recently seen</span>
        <span style={{ background: 'rgba(100,116,139,.12)', color: '#64748b', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>⚫ {entries.length - liveCount - recentCount} Offline / no data</span>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div ref={mapRef} style={{ height: 460, width: '100%' }} />
      </div>

      <div className="card">
        {loading ? (
          <div className="spinner" />
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No active technicians found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Technician</th><th>Status</th><th>Last Seen</th><th>Action</th></tr>
              </thead>
              <tbody>
                {entries
                  .slice()
                  .sort((a, b) => (a.seconds_ago ?? Infinity) - (b.seconds_ago ?? Infinity))
                  .map(e => {
                    const s = statusOf(e)
                    return (
                      <tr key={e.employee_id}>
                        <td style={{ fontWeight: 600 }}>
                          {e.name}
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{e.employee_code}{e.designation ? ` · ${e.designation}` : ''}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{agoLabel(e.seconds_ago)}</td>
                        <td>
                          <button className="btn btn-outline btn-sm" disabled={e.latitude == null} onClick={() => locate(e)}>
                            🎯 Locate
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
