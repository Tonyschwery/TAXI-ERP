import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// --- PDF EXPORT (DRIVER STATEMENT) ---
export const exportDriverStatementToPDF = (
  driverInfo: { full_name: string, driver_code: string },
  period: string,
  summary: {
    totalCompleted: number,
    totalGross: number,
    cash: number,
    credit: number,
    whish: number,
    officeCommission: number,
    driverShare: number,
    expenses: number,
    advances: number,
    openingBalance: number,
    finalBalance: number
  },
  ledgerItems: any[]
) => {
  const doc = new jsPDF()

  // Header
  doc.setFontSize(22)
  doc.text('Taxi Dispatch ERP - Driver Statement', 14, 22)
  
  doc.setFontSize(12)
  doc.text(`Driver: ${driverInfo.full_name} (${driverInfo.driver_code || 'N/A'})`, 14, 32)
  doc.text(`Period: ${period}`, 14, 38)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 44)

  // Summary Box
  doc.setFontSize(14)
  doc.text('Summary', 14, 55)
  
  autoTable(doc, {
    startY: 60,
    theme: 'grid',
    head: [['Metric', 'Amount']],
    body: [
      ['Total Completed Trips', summary.totalCompleted.toString()],
      ['Gross Revenue', `$${summary.totalGross.toFixed(2)}`],
      ['Office Commission', `$${summary.officeCommission.toFixed(2)}`],
      ['Driver Share', `$${summary.driverShare.toFixed(2)}`],
      ['Advances Taken', `-$${summary.advances.toFixed(2)}`],
      ['Reimbursable Expenses', `+$${summary.expenses.toFixed(2)}`],
      ['Opening Balance', `$${summary.openingBalance.toFixed(2)}`],
      ['Final Balance (Net)', `$${Math.abs(summary.finalBalance).toFixed(2)} (${summary.finalBalance < 0 ? 'DRIVER OWES OFFICE' : 'OFFICE OWES DRIVER'})`]
    ],
    columnStyles: { 0: { fontStyle: 'bold' } }
  })

  // Ledger Table
  doc.text('Itemized Ledger', 14, (doc as any).lastAutoTable.finalY + 15)
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    theme: 'striped',
    head: [['Date', 'Type', 'Ref', 'Description', 'Amount', 'Net Effect']],
    body: ledgerItems.map(item => [
      new Date(item.date).toLocaleString(),
      item.type,
      item.ref,
      item.desc,
      `$${Number(item.amount).toFixed(2)}`,
      `${item.effect > 0 ? '+' : ''}${Number(item.effect).toFixed(2)}`
    ]),
    styles: { fontSize: 8 }
  })

  // Signatures
  const finalY = (doc as any).lastAutoTable.finalY + 30
  if (finalY < 250) {
    doc.text('_________________________', 20, finalY)
    doc.text('Driver Signature', 30, finalY + 8)
    
    doc.text('_________________________', 130, finalY)
    doc.text('Accountant Signature', 140, finalY + 8)
  }

  doc.save(`Driver_Statement_${driverInfo.full_name}_${new Date().getTime()}.pdf`)
}

// --- PDF EXPORT (VEHICLE STATEMENT) ---
export const exportVehicleStatementToPDF = (
  vehicleInfo: { plate_number: string, make: string, model: string },
  period: string,
  summary: {
    totalCompleted: number,
    totalGross: number,
    companyShare: number,
    driverShare: number,
    fuel: number,
    maint: number,
    other: number,
    netResult: number
  },
  ledgerItems: any[]
) => {
  const doc = new jsPDF()

  // Header
  doc.setFontSize(22)
  doc.text('Taxi Dispatch ERP - Vehicle Statement', 14, 22)
  
  doc.setFontSize(12)
  doc.text(`Vehicle: ${vehicleInfo.plate_number} (${vehicleInfo.make} ${vehicleInfo.model})`, 14, 32)
  doc.text(`Period: ${period}`, 14, 38)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 44)

  // Summary Box
  doc.setFontSize(14)
  doc.text('Performance Summary', 14, 55)
  
  autoTable(doc, {
    startY: 60,
    theme: 'grid',
    head: [['Metric', 'Amount']],
    body: [
      ['Total Completed Trips', summary.totalCompleted.toString()],
      ['Gross Revenue Generated', `$${summary.totalGross.toFixed(2)}`],
      ['Driver Share', `$${summary.driverShare.toFixed(2)}`],
      ['Company Commission Share', `$${summary.companyShare.toFixed(2)}`],
      ['Fuel Expenses', `-$${summary.fuel.toFixed(2)}`],
      ['Maintenance & Repairs', `-$${summary.maint.toFixed(2)}`],
      ['Other Expenses', `-$${summary.other.toFixed(2)}`],
      ['Net Vehicle Result', `$${Math.abs(summary.netResult).toFixed(2)} (${summary.netResult >= 0 ? 'PROFIT' : 'LOSS'})`]
    ],
    columnStyles: { 0: { fontStyle: 'bold' } }
  })

  // Ledger Table
  doc.text('Itemized Ledger', 14, (doc as any).lastAutoTable.finalY + 15)
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    theme: 'striped',
    head: [['Date', 'Type', 'Category', 'Description', 'Amount (Net)']],
    body: ledgerItems.map(item => [
      new Date(item.date).toLocaleString(),
      item.type,
      item.category,
      item.desc,
      `${item.amount > 0 ? '+' : ''}${Number(item.amount).toFixed(2)}`
    ]),
    styles: { fontSize: 8 }
  })

  doc.save(`Vehicle_Statement_${vehicleInfo.plate_number}_${new Date().getTime()}.pdf`)
}

// --- EXCEL & CSV EXPORT ---
export const exportToExcel = (sheets: { sheetName: string, data: any[] }[], fileName: string) => {
  const wb = XLSX.utils.book_new()
  sheets.forEach(s => {
    const ws = XLSX.utils.json_to_sheet(s.data)
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName)
  })
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

export const exportToCSV = (data: any[], fileName: string) => {
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${fileName}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
