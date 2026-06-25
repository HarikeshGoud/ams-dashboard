import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Excel ────────────────────────────────────────────────────────────────────

export function exportExcel(sheets, filename) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, headers, rows }) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    // Column widths
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  XLSX.writeFile(wb, filename)
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function exportPDF(title, subtitle, headers, rows, filename) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 16)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(subtitle, 14, 23)

  doc.setTextColor(0)
  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 14, right: 14 },
  })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`Page ${i} of ${pageCount}  |  AMS — Water Purifier Management`,
      14, doc.internal.pageSize.height - 8)
  }

  doc.save(filename)
}

// ─── Attendance helpers ───────────────────────────────────────────────────────

export function exportAttendanceExcel(technicians, month, year, workingDays) {
  const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const headers = ['Employee', 'Code', 'Base Salary', 'Working Days', 'Present', 'Half Day', 'Absent', 'Leave', 'Att %', 'Calc Salary']
  const rows = technicians.map(t => [
    t.employee_name, t.employee_code || '', t.base_salary,
    workingDays, t.present, t.half_day, t.absent, t.leave || 0,
    t.attendance_pct + '%', t.calculated_salary
  ])
  exportExcel(
    [{ name: `${MONTHS[month]} ${year}`, headers, rows }],
    `Attendance_${MONTHS[month]}_${year}.xlsx`
  )
}

export function exportAttendancePDF(technicians, month, year, workingDays) {
  const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const headers = ['Employee', 'Code', 'Base Salary', 'Working Days', 'Present', 'Half Day', 'Absent', 'Att %', 'Calc Salary']
  const rows = technicians.map(t => [
    t.employee_name, t.employee_code || '', `₹${Number(t.base_salary).toLocaleString()}`,
    workingDays, t.present, t.half_day, t.absent,
    t.attendance_pct + '%', `₹${Number(t.calculated_salary).toLocaleString()}`
  ])
  exportPDF(
    `Attendance Report — ${MONTHS[month]} ${year}`,
    `Working days: ${workingDays}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`,
    headers, rows,
    `Attendance_${MONTHS[month]}_${year}.pdf`
  )
}

// ─── Salary helpers ───────────────────────────────────────────────────────────

export function exportSalaryExcel(technicians, overrides, month, year, workingDays) {
  const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const headers = ['Employee', 'Code', 'Base Salary', 'Present', 'Att %', 'Calc Salary', 'Final Payout', 'Override Note']
  const rows = technicians.map(t => {
    const ovr = overrides[t.employee_id]
    return [
      t.employee_name, t.employee_code || '', t.base_salary,
      t.present, t.attendance_pct + '%',
      t.calculated_salary,
      ovr ? ovr.final_amount : t.calculated_salary,
      ovr?.note || ''
    ]
  })
  exportExcel(
    [{ name: `Salary ${MONTHS[month]} ${year}`, headers, rows }],
    `Salary_${MONTHS[month]}_${year}.xlsx`
  )
}

export function exportSalaryPDF(technicians, overrides, month, year, workingDays) {
  const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const headers = ['Employee', 'Base Salary', 'Present', 'Att %', 'Calc Salary', 'Final Payout', 'Note']
  const rows = technicians.map(t => {
    const ovr = overrides[t.employee_id]
    return [
      t.employee_name,
      `₹${Number(t.base_salary).toLocaleString()}`,
      t.present,
      t.attendance_pct + '%',
      `₹${Number(t.calculated_salary).toLocaleString()}`,
      `₹${Number(ovr ? ovr.final_amount : t.calculated_salary).toLocaleString()}`,
      ovr?.note || '—'
    ]
  })
  exportPDF(
    `Salary Report — ${MONTHS[month]} ${year}`,
    `Working days: ${workingDays}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`,
    headers, rows,
    `Salary_${MONTHS[month]}_${year}.pdf`
  )
}
