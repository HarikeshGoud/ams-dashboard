import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons broken by webpack/vite bundling
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function MapPicker({ onConfirm, onClose, initialLabel = '' }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const [search, setSearch] = useState(initialLabel)
  const [searching, setSearching] = useState(false)
  const [pinned, setPinned] = useState(null)   // { lat, lng, label }
  const [gpsLoading, setGpsLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current, { center: [17.385, 78.486], zoom: 12 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)

    map.on('click', async (e) => {
      const { lat, lng } = e.latlng
      placeMarker(map, lat, lng)
      // reverse geocode
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
          headers: { 'User-Agent': 'AMS-Dashboard/1.0' }
        })
        const d = await r.json()
        const label = d.display_name?.split(',').slice(0, 3).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        setPinned({ lat, lng, label })
        setSearch(label)
      } catch {
        setPinned({ lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
        setSearch(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      }
    })

    mapInstanceRef.current = map
    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  function placeMarker(map, lat, lng) {
    if (markerRef.current) markerRef.current.remove()
    markerRef.current = L.marker([lat, lng]).addTo(map)
    map.setView([lat, lng], Math.max(map.getZoom(), 14))
  }

  async function searchLocation() {
    if (!search.trim()) return
    setSearching(true); setErr('')
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search + ', Telangana, India')}&format=json&limit=1&countrycodes=in`,
        { headers: { 'User-Agent': 'AMS-Dashboard/1.0' } }
      )
      const d = await r.json()
      if (d.length === 0) { setErr('Location not found. Try a different name.'); setSearching(false); return }
      const lat = parseFloat(d[0].lat); const lng = parseFloat(d[0].lon)
      const label = d[0].display_name?.split(',').slice(0, 3).join(', ') || search
      placeMarker(mapInstanceRef.current, lat, lng)
      setPinned({ lat, lng, label })
      setSearch(label)
    } catch { setErr('Search failed. Check connection.') }
    setSearching(false)
  }

  function useMyGPS() {
    if (!navigator.geolocation) { setErr('GPS not supported'); return }
    setGpsLoading(true); setErr('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude
        placeMarker(mapInstanceRef.current, lat, lng)
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
            headers: { 'User-Agent': 'AMS-Dashboard/1.0' }
          })
          const d = await r.json()
          const label = d.display_name?.split(',').slice(0, 3).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          setPinned({ lat, lng, label })
          setSearch(label)
        } catch {
          setPinned({ lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
        }
        setGpsLoading(false)
      },
      () => { setErr('Could not get GPS. Enable location in browser.'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560,
        boxShadow: '0 8px 40px rgba(0,0,0,.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📍 Pick Start Location</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchLocation()}
            placeholder="Search area, landmark, address…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 13,
            }}
          />
          <button onClick={searchLocation} disabled={searching} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            {searching ? '…' : '🔍'}
          </button>
          <button onClick={useMyGPS} disabled={gpsLoading} style={{
            padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(52,211,153,.15)',
            color: 'var(--green)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            {gpsLoading ? '📡' : '📍 My GPS'}
          </button>
        </div>

        {err && <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)', background: 'rgba(239,68,68,.08)' }}>⚠️ {err}</div>}

        {/* Map */}
        <div ref={mapRef} style={{ height: 320, width: '100%' }} />

        {/* Hint */}
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
          Tap anywhere on the map to drop a pin · or search above · or use GPS
        </div>

        {/* Confirm */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button
            onClick={() => pinned && onConfirm(pinned)}
            disabled={!pinned}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 14,
              background: pinned ? 'var(--accent)' : 'var(--surface2)',
              color: pinned ? '#fff' : 'var(--muted)', cursor: pinned ? 'pointer' : 'not-allowed',
            }}>
            {pinned ? `✅ Use "${pinned.label.substring(0, 35)}…"` : 'Pin a location first'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
