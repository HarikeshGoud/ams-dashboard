import { useRef, useEffect, useState } from 'react'

export default function SignaturePad({ label, onSigned, style = {} }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  function draw(e) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function endDraw(e) {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    const dataUrl = canvas.toDataURL('image/png')
    setSigned(true)
    onSigned(dataUrl)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
    onSigned(null)
  }

  return (
    <div style={{ ...style }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label} {signed && <span style={{ color: 'var(--green)' }}>✓ Signed</span>}</span>
        <button onClick={clear} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        style={{
          width: '100%', height: 100, border: `2px dashed ${signed ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block'
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!signed && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
          ✏️ Draw signature above
        </div>
      )}
    </div>
  )
}
