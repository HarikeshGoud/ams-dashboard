import { useState, useRef, useEffect } from 'react'

// Drop-in replacement for a long <select>: same value/onChange(value) contract,
// but lets the user type to filter instead of scrolling hundreds of options.
export default function SearchableSelect({ value, onChange, options, placeholder = 'Select…', disabled = false, style }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function openDropdown() {
    if (disabled) return
    setOpen(true)
    setHighlight(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function selectOption(opt) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { setHighlight(h => Math.min(h + 1, filtered.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHighlight(h => Math.max(h - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter') { if (filtered[highlight]) selectOption(filtered[highlight]); e.preventDefault() }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div
        onClick={openDropdown}
        style={{
          padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
          background: disabled ? 'var(--surface2)' : 'var(--surface)', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 13,
          color: selected ? 'var(--text)' : 'var(--muted)', minHeight: 20,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selected && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange('') }}
              style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }} title="Clear">✕</span>
          )}
          <span style={{ fontSize: 9, color: 'var(--muted)' }}>▼</span>
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 300, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxHeight: 280, display: 'flex', flexDirection: 'column'
        }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Type to search…"
            style={{
              padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, outline: 'none',
              borderRadius: '8px 8px 0 0', boxSizing: 'border-box'
            }}
          />
          <div style={{ overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>No matches</div>
            ) : filtered.map((opt, i) => (
              <div
                key={opt.value}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  background: i === highlight ? 'var(--surface2)' : String(opt.value) === String(value) ? 'rgba(34,211,238,.1)' : 'transparent',
                  color: String(opt.value) === String(value) ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
