import { useRef, useEffect, useState, useCallback } from 'react'

// Signing happens with a fingertip on a phone, so the drawing area is deliberately
// tall. The pixel buffer is sized to the box's real on-screen size (times the device
// pixel ratio) rather than a fixed 400x120: that keeps strokes sharp and, more
// importantly, stops the saved signature being stretched — a fixed buffer with a
// different aspect ratio to the visible box distorts whatever was drawn.
export default function SignaturePad({ label, onSigned, height = 200, style = {} }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const dirty     = useRef(false)     // has anything actually been drawn
  const [signed, setSigned] = useState(false)

  const prime = useCallback((ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#1e293b'
    ctx.lineCap  = 'round'
    ctx.lineJoin = 'round'
  }, [])

  // Match the buffer to the rendered size. Resizing a canvas wipes it, so the
  // existing drawing is copied across instead of being lost.
  const fit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width === w && canvas.height === h) return

    let previous = null
    if (dirty.current && canvas.width && canvas.height) {
      previous = document.createElement('canvas')
      previous.width = canvas.width
      previous.height = canvas.height
      previous.getContext('2d').drawImage(canvas, 0, 0)
    }

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    prime(ctx, w, h)
    ctx.lineWidth = 2.5 * dpr
    if (previous) ctx.drawImage(previous, 0, 0, w, h)
  }, [prime])

  useEffect(() => {
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [fit])

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const src = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // A single tap should still leave a mark
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
    drawing.current = true
    dirty.current = true
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

  function endDraw() {
    if (!drawing.current) return
    drawing.current = false
    const dataUrl = canvasRef.current.toDataURL('image/png')
    setSigned(true)
    onSigned(dataUrl)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    prime(ctx, canvas.width, canvas.height)
    ctx.lineWidth = 2.5 * Math.min(window.devicePixelRatio || 1, 2)
    dirty.current = false
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
        style={{
          width: '100%', height, border: `2px dashed ${signed ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: 10, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block'
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        onTouchCancel={endDraw}
      />
      {!signed && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
          ✏️ Sign anywhere in the box above
        </div>
      )}
    </div>
  )
}
