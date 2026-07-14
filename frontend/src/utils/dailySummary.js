// Builds a WhatsApp-ready daily task summary, one section per technician,
// covering everyone with at least one task due on the given date.
export function buildDailyTaskSummary(dateStr, tasks, employees, fieldReports) {
  const techs = employees.filter(e => e.role === 'technician')
  const reportsByTaskId = {}
  ;(fieldReports || [])
    .filter(r => r.report_date === dateStr && r.task_id)
    .forEach(r => { reportsByTaskId[r.task_id] = r })

  const lines = [`📊 *Daily Task Summary — ${dateStr}*`, '']
  let totalTasks = 0, totalDone = 0, activeTechCount = 0

  techs.forEach(emp => {
    const empTasks = tasks.filter(t => t.assigned_to_id === emp.id && t.due_date === dateStr)
    if (empTasks.length === 0) return
    activeTechCount++

    const done = empTasks.filter(t => t.status === 'completed').length
    totalTasks += empTasks.length
    totalDone += done

    lines.push(`👷 *${emp.name}* (${emp.employee_code || '—'}) — ${done}/${empTasks.length} completed`)
    empTasks.forEach(t => {
      const rep = reportsByTaskId[t.id]
      const statusIcon = t.status === 'completed' ? '✅' : t.status === 'submitted' ? '⏳' : '⬜'
      const schoolPart = t.school_name ? ` — ${t.school_name}` : ''
      const itemPart = rep?.item_installed ? ` (${rep.item_installed})` : ''
      lines.push(`  ${statusIcon} ${t.title}${schoolPart}${itemPart}`)
    })
    lines.push('')
  })

  if (activeTechCount === 0) {
    lines.push('No tasks were scheduled for this date.')
  } else {
    lines.push('━━━━━━━━━━━━━━━')
    lines.push(`*Total: ${totalDone}/${totalTasks} tasks completed* across ${activeTechCount} technician${activeTechCount > 1 ? 's' : ''}`)
  }
  lines.push('')
  lines.push('AMS Dashboard — Water Purifier Management')

  return lines.join('\n')
}

export function sendDailySummaryWhatsApp(dateStr, tasks, employees, fieldReports) {
  const msg = buildDailyTaskSummary(dateStr, tasks, employees, fieldReports)
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
}
