// A site is overdue if it has never been visited, or its last visit
// was more than 3 calendar months ago.

export function isOverdue(lastVisitDate) {
  if (!lastVisitDate) return true
  const last = new Date(lastVisitDate)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  return last < cutoff
}
