// Builds a WhatsApp/Email-ready daily task summary as plain text.

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

  const todaysTasks = tasks.filter(t => t.due_date === dateStr)
  const countByStatus = status => todaysTasks.filter(t => t.status === status).length

  const lines = [
    '📊 DAILY TASK SUMMARY',
    `📅 ${formatDateHeader(dateStr)}`,
    DIVIDER,
    '',
    'OVERVIEW',
    `✅ Completed ${countByStatus('completed')}   ·   📤 Submitted ${countByStatus('submitted')}`,
    `🔄 In Progress ${countByStatus('in_progress')}   ·   ⏳ Pending ${countByStatus('pending')}`,
  ]

  let activeTechCount = 0
  const techLines = []

  techs.forEach(emp => {
    const empTasks = todaysTasks.filter(t => t.assigned_to_id === emp.id)
    if (empTasks.length === 0) return
    activeTechCount++

    const doneTasks = empTasks.filter(t => t.status === 'completed')
    const openCount = empTasks.length - doneTasks.length

    techLines.push('')
    techLines.push(`👷 ${emp.name}  —  ${doneTasks.length} done · ${openCount} pending`)
    doneTasks.forEach(t => {
      const rep = reportsByTaskId[t.id]
      const schoolPart = (t.school_name && !t.title.includes(t.school_name)) ? ` — ${t.school_name}` : ''
      const itemPart = rep?.item_installed ? ` (${rep.item_installed})` : ''
      techLines.push(`   ✓ ${t.title}${schoolPart}${itemPart}`)
    })
  })

  if (activeTechCount > 0) {
    lines.push(DIVIDER)
    lines.push('TECHNICIAN UPDATES')
    lines.push(...techLines)
  }

  lines.push('')
  lines.push(DIVIDER)
  if (activeTechCount === 0) {
    lines.push('No tasks were scheduled for this date.')
  } else {
    lines.push(`✅ ${countByStatus('completed')} of ${todaysTasks.length} tasks completed  ·  ${activeTechCount} technician${activeTechCount > 1 ? 's' : ''} active`)
  }
  lines.push('')
  lines.push('Sri Hamsini & Chandra Enterprises')

  return lines.join('\n')
}
