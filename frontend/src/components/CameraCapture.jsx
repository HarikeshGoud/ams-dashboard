import { useState, useRef, useEffect } from 'react'

export default function CameraCapture({ onCapture, onClose, gps, siteName, showGps = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); setReady(true) }
    }).catch(() => setError('Camera access denied. Please allow camera permission and try again.'))
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  function capture() {
    const video = videoRef.current, canvas = canvasRef.current
    const MAX_W = 1280
    const scale = video.videoWidth > MAX_W ? MAX_W / video.videoWidth : 1
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const now = new Date(), W = canvas.width, H = canvas.height
    const siteLabel = siteName && siteName.length > 45 ? siteName.slice(0, 44) + '…' : siteName
    const lines = [
      ...(siteLabel ? [siteLabel] : []),
      now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '  ' +
      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      ...(showGps ? [gps ? `GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'GPS: unavailable'] : []),
    ]
    const fontSize = Math.max(14, Math.round(W * 0.022))
    const padding = Math.round(fontSize * 0.6), lineH = fontSize + padding
    const boxH = lineH * lines.length + padding * 2, boxY = H - boxH - Math.round(H * 0.015), boxX = Math.round(W * 0.015)

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.beginPath(); ctx.roundRect(boxX, boxY, W - boxX * 2, boxH, 6); ctx.fill()
    ctx.font = `bold ${fontSize}px monospace`; ctx.textBaseline = 'top'
    lines.forEach((line, i) => {
      const y = boxY + padding + i * lineH
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(line, boxX + padding + 1, y + 1)
      ctx.fillStyle = '#fff'; ctx.fillText(line, boxX + padding, y)
    })
    ctx.restore()

    canvas.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      streamRef.current?.getTracks().forEach(t => t.stop())
      onCapture(file, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.82)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {error ? (
        <div style={{ color: '#f87171', fontSize: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📵</div>{error}<br /><br />
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 640, maxHeight: '70vh', objectFit: 'cover', borderRadius: 8, display: ready ? 'block' : 'none' }} />
          {!ready && <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>Starting camera…</div>}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
            <button onClick={capture} disabled={!ready} style={{ width: 70, height: 70, borderRadius: '50%', background: ready ? '#fff' : '#475569', border: '4px solid #94a3b8', cursor: ready ? 'pointer' : 'not-allowed', fontSize: 28 }}>📸</button>
            <button className="btn btn-outline" onClick={onClose} style={{ alignSelf: 'center' }}>Cancel</button>
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 12 }}>Tap 📸 to capture — live camera only</div>
        </>
      )}
    </div>
  )
}
