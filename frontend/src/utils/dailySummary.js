// Builds a WhatsApp-ready daily task summary. Only technicians who completed
// at least one task get a section, listing just the work they finished —
// pending/incomplete tasks are left out entirely.

export function buildDailyTaskSummary(dateStr, tasks, employees, fieldReports) {
  const techs = employees.filter(e => e.role === 'technician')
  const reportsByTaskId = {}
  ;(fieldReports || [])
    .filter(r => r.report_date === dateStr && r.task_id)
    .forEach(r => { reportsByTaskId[r.task_id] = r })

  const lines = [`📊 *Daily Task Summary — ${dateStr}*`, '']
  let totalDone = 0, activeTechCount = 0

  techs.forEach(emp => {
    const empTasks = tasks.filter(t => t.assigned_to_id === emp.id && t.due_date === dateStr)
    if (empTasks.length === 0) return
    activeTechCount++

    const doneTasks = empTasks.filter(t => t.status === 'completed')
    if (doneTasks.length === 0) return
    totalDone += doneTasks.length

    lines.push(`👷 *${emp.name}* — completed ${doneTasks.length} task${doneTasks.length > 1 ? 's' : ''}`)
    doneTasks.forEach(t => {
      const rep = reportsByTaskId[t.id]
      const schoolPart = (t.school_name && !t.title.includes(t.school_name)) ? ` — ${t.school_name}` : ''
      const itemPart = rep?.item_installed ? ` (${rep.item_installed})` : ''
      lines.push(`  ✅ ${t.title}${schoolPart}${itemPart}`)
    })
    lines.push('')
  })

  if (activeTechCount === 0) {
    lines.push('No tasks were scheduled for this date.')
  } else {
    if (totalDone === 0) { lines.push('No tasks completed yet today.', '') }
    lines.push('━━━━━━━━━━━━━━━')
    lines.push(`*Total: ${totalDone} task${totalDone !== 1 ? 's' : ''} completed* across ${activeTechCount} technician${activeTechCount > 1 ? 's' : ''}`)
  }
  lines.push('')
  lines.push('Sri Hamsini & Chandra Enterprises')

  return lines.join('\n')
}

export function sendDailySummaryWhatsApp(dateStr, tasks, employees, fieldReports) {
  const msg = buildDailyTaskSummary(dateStr, tasks, employees, fieldReports)
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
}
