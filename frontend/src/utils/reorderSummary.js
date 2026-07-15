// Builds a WhatsApp-ready reorder list for whoever handles purchasing —
// only open requests (pending/ordered), nothing already received or cancelled.
export function buildReorderSummary(requests) {
  const open = (requests || []).filter(r => r.status === 'pending' || r.status === 'ordered')

  const lines = [`📦 *Stock Reorder List*`, '']

  if (open.length === 0) {
    lines.push('Nothing currently needs reordering.')
  } else {
    open.forEach(r => {
      const statusIcon = r.status === 'ordered' ? '🚚' : '🆕'
      lines.push(`${statusIcon} *${r.item_name}* — need ${r.requested_qty} ${r.item_unit || ''}`.trim())
      if (r.status === 'ordered') lines.push('   (already ordered, awaiting delivery)')
      if (r.note) lines.push(`   note: ${r.note}`)
    })
    lines.push('')
    lines.push(`*Total: ${open.length} item${open.length > 1 ? 's' : ''} to order*`)
  }

  lines.push('')
  lines.push('Sri Hamsini & Chandra Enterprises')

  return lines.join('\n')
}

export function sendReorderSummaryWhatsApp(requests) {
  const msg = buildReorderSummary(requests)
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
}
