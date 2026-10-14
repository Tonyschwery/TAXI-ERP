'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportDriverStatementToPDF, exportToExcel, exportToCSV } from '@/utils/reportExporter'

export default function StatementsClient({ drivers }: { drivers: any[] }) {
  const supabase = createClient()
  
  const [filterRange, setFilterRange] = useState('month') // today, week, month, custom
  const [filterDriver, setFilterDriver] = useState(drivers[0]?.id || '')
  
  const [orders, setOrders] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const fetchData = async () => {
    if (!filterDriver) return
    setIsLoading(true)

    // Calculate dates
    let startDate = new Date()
    if (filterRange === 'today') startDate.setHours(0,0,0,0)
    if (filterRange === 'week') startDate.setDate(startDate.getDate() - 7)
    if (filterRange === 'month') startDate.setMonth(startDate.getMonth() - 1)
    if (filterRange === 'custom') startDate = new Date('2020-01-01')

    const startIso = startDate.toISOString()

    // 1. Fetch Orders in period
    const { data: ord } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_driver_id', filterDriver)
      .eq('status', 'completed')
      .gte('created_at', startIso)
      .order('created_at', { ascending: true })

    // 2. Fetch Transactions in period
    const { data: tx } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('driver_id', filterDriver)
      .gte('transaction_date', startIso)
      .order('transaction_date', { ascending: true })

    // 3. Fetch Opening Balance (sum of balance_effect_on_driver BEFORE start date)
    const { data: prevTx } = await supabase
      .from('financial_transactions')
      .select('balance_effect_on_driver')
      .eq('driver_id', filterDriver)
      .lt('transaction_date', startIso)

    let openBal = 0
    if (prevTx) {
      openBal = prevTx.reduce((sum, t) => sum + Number(t.balance_effect_on_driver), 0)
    }

    setOrders(ord || [])
    setTransactions(tx || [])
    setOpeningBalance(openBal)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [filterRange, filterDriver])

  // --- Calculations ---
  // Revenue & Orders
  const totalCompleted = orders.length
  const totalGross = orders.reduce((sum, o) => sum + Number(o.final_fare), 0)
  
  // Payment Breakdown
  const totalCash = orders.filter(o => o.payment_method_code === 'cash').reduce((sum, o) => sum + Number(o.final_fare), 0)
  const totalCredit = orders.filter(o => o.payment_method_code === 'credit').reduce((sum, o) => sum + Number(o.final_fare), 0)
  const totalWhish = orders.filter(o => o.payment_method_code === 'whish').reduce((sum, o) => sum + Number(o.final_fare), 0)

  // Commission & Shares
  const totalOfficeCommission = orders.reduce((sum, o) => sum + Number(o.office_share_amount), 0)
  const totalDriverShare = totalGross - totalOfficeCommission

  // Transactions Breakdown (during period)
  const reimbursableExpenses = transactions.filter(t => t.transaction_type === 'expense_reimbursement').reduce((sum, t) => sum + Number(t.amount), 0)
  const advancesTaken = transactions.filter(t => t.transaction_type === 'driver_advance').reduce((sum, t) => sum + Number(t.amount), 0)
  const cashPaidToOffice = transactions.filter(t => t.transaction_type === 'cash_received_from_driver').reduce((sum, t) => sum + Number(t.amount), 0)
  const cashReceivedFromOffice = transactions.filter(t => t.transaction_type === 'cash_paid_to_driver').reduce((sum, t) => sum + Number(t.amount), 0)

  // Final Net Balance Payable/Receivable
  // The exact running balance at the END of this period
  // Filter non-trip transactions (advances, cash settlements, expense reimbursements)
  // because completed trip impacts are calculated directly from orders below:
  const nonTripTransactions = transactions.filter(t => !['trip_commission_debt', 'trip_payout_credit'].includes(t.transaction_type))
  const periodTxEffect = nonTripTransactions.reduce((sum, t) => sum + Number(t.balance_effect_on_driver), 0)
  
  let orderBalanceEffect = 0
  orders.forEach(o => {
    if (o.payment_method_code === 'cash') {
      orderBalanceEffect -= Number(o.office_share_amount) // Driver owes office their cut
    } else {
      // Credit or Whish: Office collected full fare. Office owes driver their cut.
      const driverCut = Number(o.final_fare) - Number(o.office_share_amount)
      orderBalanceEffect += driverCut
    }
  })

  // Period change from trips + financial settlements:
  const periodNetChange = periodTxEffect + orderBalanceEffect
  
  // Total running balance at the end of period
  const finalBalance = openingBalance + periodNetChange

  // Prepare unified ledger table
  const ledgerItems = [
    ...orders.map(o => ({
      id: o.id,
      date: o.created_at,
      type: 'Trip',
      ref: `Order #${o.order_number}`,
      desc: `${o.pickup_address.substring(0, 15)} -> ${o.destination_address.substring(0, 15)}`,
      amount: o.final_fare,
      payment: o.payment_method_code,
      effect: o.payment_method_code === 'cash' ? -Number(o.office_share_amount) : (Number(o.final_fare) - Number(o.office_share_amount))
    })),
    ...nonTripTransactions.map(t => ({
      id: t.id,
      date: t.transaction_date,
      type: 'Tx',
      ref: t.transaction_type.replace(/_/g, ' '),
      desc: t.description,
      amount: t.amount,
      payment: t.payment_method_code,
      effect: Number(t.balance_effect_on_driver)
    }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="space-y-6">
      
      {/* Top Controls */}
      <div className="flex gap-4 items-end bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Driver</label>
          <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black font-bold">
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.driver_code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Statement Period</label>
          <select value={filterRange} onChange={e => setFilterRange(e.target.value)} className="border p-2 rounded bg-gray-50 dark:bg-black font-bold w-48">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">All Time</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-500 font-bold">Loading statement...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Summary Cards */}
          <div className="xl:col-span-1 space-y-4">
            
            {/* The Big Final Balance */}
            <div className={`p-6 rounded-2xl shadow-sm border ${finalBalance < 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20'}`}>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Final Statement Balance</div>
              <div className={`text-3xl font-black mb-2 ${finalBalance < 0 ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                ${Math.abs(finalBalance).toFixed(2)}
              </div>
              <div className={`font-bold uppercase ${finalBalance < 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {finalBalance < 0 ? 'DRIVER MUST PAY OFFICE' : 'OFFICE MUST PAY DRIVER'}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3 text-sm">
              <h3 className="font-bold text-lg mb-2">Period Overview</h3>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Total Completed Trips</span> <span className="font-bold">{totalCompleted}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Gross Revenue</span> <span className="font-bold">${totalGross.toFixed(2)}</span></div>
              
              <div className="pt-2 text-xs font-bold text-gray-400 uppercase">Payment Breakdown</div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Cash Trips</span> <span>${totalCash.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Credit Trips</span> <span>${totalCredit.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">Whish Trips</span> <span>${totalWhish.toFixed(2)}</span></div>
              
              <div className="pt-2 text-xs font-bold text-gray-400 uppercase">Commission & Shares</div>
              <div className="flex justify-between"><span className="text-gray-500">Office Commission</span> <span className="font-bold text-blue-600">${totalOfficeCommission.toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Driver Share</span> <span className="font-bold text-blue-600">${totalDriverShare.toFixed(2)}</span></div>
              
              <div className="pt-2 text-xs font-bold text-gray-400 uppercase">Transactions</div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Reimbursable Expenses</span> <span className="text-green-600">+${reimbursableExpenses.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Advances Taken</span> <span className="text-red-500">-${advancesTaken.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Cash Paid to Office</span> <span className="text-green-600">+${cashPaidToOffice.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">Cash Received from Office</span> <span className="text-red-500">-${cashReceivedFromOffice.toFixed(2)}</span></div>

              <div className="flex justify-between font-bold pt-2"><span className="text-gray-500">Opening Debt/Balance</span> <span>${Math.abs(openingBalance).toFixed(2)} {openingBalance < 0 ? '(Owed)' : '(Credit)'}</span></div>
            </div>

          </div>

          {/* Unified Statement Table */}
          <div className="xl:col-span-2 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col h-[700px]">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-lg">Itemized Statement</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const d = drivers.find(drv => drv.id === filterDriver)
                    exportDriverStatementToPDF(d, filterRange, {
                      totalCompleted, totalGross, cash: totalCash, credit: totalCredit, whish: totalWhish,
                      officeCommission: totalOfficeCommission, driverShare: totalDriverShare, expenses: reimbursableExpenses,
                      advances: advancesTaken, openingBalance, finalBalance
                    }, ledgerItems)
                  }}
                  className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 rounded font-bold hover:bg-red-200"
                >
                  Export PDF
                </button>
                <button 
                  onClick={() => exportToExcel([{ sheetName: 'Ledger', data: ledgerItems }], `Driver_Statement_${filterDriver}`)}
                  className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded font-bold hover:bg-green-200"
                >
                  Excel
                </button>
                <button 
                  onClick={() => exportToCSV(ledgerItems, `Driver_Statement_${filterDriver}`)}
                  className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded font-bold hover:bg-blue-200"
                >
                  CSV
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-black text-gray-500 uppercase text-[10px] sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Ref</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3 text-right">Net Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerItems.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No activity in this period.</td></tr>}
                  {ledgerItems.map((item, idx) => (
                    <tr key={idx} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-3 whitespace-nowrap">{new Date(item.date).toLocaleString()}</td>
                      <td className="p-3">
                        {item.type === 'Trip' ? 
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">TRIP</span> : 
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold">TX</span>}
                      </td>
                      <td className="p-3 font-bold text-xs uppercase">{item.ref}</td>
                      <td className="p-3 text-xs">{item.desc}</td>
                      <td className="p-3 font-bold">${Number(item.amount).toFixed(2)}</td>
                      <td className="p-3 text-right font-black">
                        {item.effect > 0 ? (
                          <span className="text-amber-500">+{item.effect.toFixed(2)}</span>
                        ) : item.effect < 0 ? (
                          <span className="text-green-600">{item.effect.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">0.00</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
