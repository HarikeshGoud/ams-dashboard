// Builds a WhatsApp/Email-ready daily task summary as plain text.
// Client-facing: shows only completed work, no internal workflow states.
// Avoids pictographic emoji (📊 👷 ✅ etc.) — WhatsApp's wa.me deep link
// corrupts them into replacement characters. Plain symbols (✓, ━) are safe.

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━'

function formatDateHeader(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildDailyTaskSummary(dateStr, tasks, employees, fieldReports) {
  const techs = employees.filter(e => e.role === 'technician')
  const reportsByTaskId = {}
  ;(fieldReports || [])
    .filter(r => r.report_date === dateStr && r.task_id)
    .forEach(r => { reportsByTaskId[r.task_id] = r })

  const completedToday = tasks.filter(t => t.due_date === dateStr && t.status === 'completed')

  const lines = [
    'DAILY TASK SUMMARY',
    formatDateHeader(dateStr),
    DIVIDER,
  ]

  let activeTechCount = 0

  techs.forEach(emp => {
    const doneTasks = completedToday.filter(t => t.assigned_to_id === emp.id)
    if (doneTasks.length === 0) return
    activeTechCount++

    lines.push('')
    lines.push(emp.name)
    doneTasks.forEach(t => {
      const rep = reportsByTaskId[t.id]
      const schoolPart = (t.school_name && !t.title.includes(t.school_name)) ? ` — ${t.school_name}` : ''
      const itemPart = rep?.item_installed ? ` (${rep.item_installed})` : ''
      lines.push(`   ✓ ${t.title}${schoolPart}${itemPart}`)
    })
  })

  lines.push('')
  lines.push(DIVIDER)
  if (activeTechCount === 0) {
    lines.push('No tasks completed for this date.')
  } else {
    lines.push(`${completedToday.length} task${completedToday.length !== 1 ? 's' : ''} completed today  ·  ${activeTechCount} technician${activeTechCount > 1 ? 's' : ''}`)
  }
  lines.push('')
  lines.push('Sri Hamsini & Chandra Enterprises')

  return lines.join('\n')
}
