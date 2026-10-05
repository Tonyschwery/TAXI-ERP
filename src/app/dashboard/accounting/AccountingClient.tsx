'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, exportToCSV } from '@/utils/reportExporter'

export default function AccountingClient({ drivers, vehicles }: { drivers: any[], vehicles: any[] }) {
  const supabase = createClient()
  
  const [filterRange, setFilterRange] = useState('month') // today, week, month, custom
  
  const [orders, setOrders] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchData = async () => {
    setIsLoading(true)

    let startDate = new Date()
    if (filterRange === 'today') startDate.setHours(0,0,0,0)
    if (filterRange === 'week') startDate.setDate(startDate.getDate() - 7)
    if (filterRange === 'month') startDate.setMonth(startDate.getMonth() - 1)
    if (filterRange === 'custom') startDate = new Date('2020-01-01')

    const startIso = startDate.toISOString()

    // Fetch all orders
    const { data: ord } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', startIso)

    // Fetch all expenses
    const { data: exp } = await supabase
      .from('vehicle_expenses')
      .select('*')
      .gte('expense_date', startIso)

    // Fetch all transactions to compute running balances
    const { data: tx } = await supabase
      .from('financial_transactions')
      .select('driver_id, balance_effect_on_driver')
      .not('driver_id', 'is', null)

    setOrders(ord || [])
    setExpenses(exp || [])
    setTransactions(tx || [])
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [filterRange])

  // --- Calculations ---
  const allOrders = orders.length
  const completedOrders = orders.filter(o => o.status === 'completed')
  const cancelledOrders = orders.filter(o => o.status === 'cancelled')
  const cancelRate = allOrders > 0 ? (cancelledOrders.length / allOrders) * 100 : 0

  const grossRevenue = completedOrders.reduce((sum, o) => sum + Number(o.final_fare), 0)
  
  const cashRevenue = completedOrders.filter(o => o.payment_method_code === 'cash').reduce((sum, o) => sum + Number(o.final_fare), 0)
  const creditRevenue = completedOrders.filter(o => o.payment_method_code === 'credit').reduce((sum, o) => sum + Number(o.final_fare), 0)
  const whishRevenue = completedOrders.filter(o => o.payment_method_code === 'whish').reduce((sum, o) => sum + Number(o.final_fare), 0)

  const officeCommission = completedOrders.reduce((sum, o) => sum + Number(o.office_share_amount), 0)
  
  // Total Fleet Expenses (Only those paid by office deduct from office profit)
  const officeExpenses = expenses.filter(e => e.paid_by === 'office').reduce((sum, e) => sum + Number(e.amount), 0)
  
  // True Office Net Profit
  const trueNetProfit = officeCommission - officeExpenses

  // Driver Balances
  const driverBalances: Record<string, number> = {}
  drivers.forEach(d => driverBalances[d.id] = 0)
  transactions.forEach(t => {
    if (t.driver_id) {
      driverBalances[t.driver_id] = (driverBalances[t.driver_id] || 0) + Number(t.balance_effect_on_driver)
    }
  })
  
  const topDrivers = drivers.map(d => {
    const drvOrders = completedOrders.filter(o => o.assigned_driver_id === d.id)
    const rev = drvOrders.reduce((sum, o) => sum + Number(o.final_fare), 0)
    return { ...d, trips: drvOrders.length, revenue: rev, balance: driverBalances[d.id] || 0 }
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  // Vehicle Stats
  const topVehicles = vehicles.map(v => {
    const vehOrders = completedOrders.filter(o => o.assigned_vehicle_id === v.id)
    const rev = vehOrders.reduce((sum, o) => sum + Number(o.office_share_amount), 0) // Company share
    const vehExp = expenses.filter(e => e.vehicle_id === v.id && e.paid_by === 'office').reduce((sum, e) => sum + Number(e.amount), 0)
    return { ...v, trips: vehOrders.length, revenue: rev, expenses: vehExp, net: rev - vehExp }
  }).sort((a, b) => b.net - a.net)

  // Export Data Builder
  const exportDashboard = () => {
    const kpiData = [
      { Metric: 'Completed Orders', Value: completedOrders.length },
      { Metric: 'Cancellation Rate', Value: `${cancelRate.toFixed(1)}%` },
      { Metric: 'Gross Revenue', Value: `$${grossRevenue.toFixed(2)}` },
      { Metric: 'Cash Orders', Value: `$${cashRevenue.toFixed(2)}` },
      { Metric: 'Credit Orders', Value: `$${creditRevenue.toFixed(2)}` },
      { Metric: 'Whish Orders', Value: `$${whishRevenue.toFixed(2)}` },
      { Metric: 'Total Office Commission', Value: `$${officeCommission.toFixed(2)}` },
      { Metric: 'Total Office Expenses', Value: `$${officeExpenses.toFixed(2)}` },
      { Metric: 'True Net Profit', Value: `$${trueNetProfit.toFixed(2)}` }
    ]

    const drvData = topDrivers.map(d => ({ Driver: d.full_name, Trips: d.trips, Revenue: d.revenue, CurrentBalance: d.balance }))
    const vehData = topVehicles.map(v => ({ Vehicle: v.plate_number, Trips: v.trips, CompanyRevenue: v.revenue, Expenses: v.expenses, NetResult: v.net }))

    exportToExcel([
      { sheetName: 'KPIs', data: kpiData },
      { sheetName: 'Top Drivers', data: drvData },
      { sheetName: 'Vehicles', data: vehData }
    ], `Accounting_Dashboard_${filterRange}`)
  }

  return (
    <div className="space-y-6">
      
      {/* Controls */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex gap-2">
          {['today', 'week', 'month', 'custom'].map(r => (
            <button 
              key={r} 
              onClick={() => setFilterRange(r)}
              className={`px-4 py-2 rounded-lg font-bold text-sm capitalize ${filterRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              {r === 'custom' ? 'All Time' : r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={exportDashboard} className="text-sm bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-4 py-2 rounded-lg font-bold hover:bg-green-200">
            Export Report (Excel)
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-500 font-bold">Calculating financial metrics...</div>
      ) : (
        <>
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
            
            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center items-center text-center">
              <span className="text-xs font-bold text-gray-500 uppercase mb-1">Completed</span>
              <span className="text-3xl font-black">{completedOrders.length}</span>
              <span className="text-xs text-red-500 mt-1">{cancelRate.toFixed(1)}% Cancel Rate</span>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center items-center text-center xl:col-span-2">
              <span className="text-xs font-bold text-gray-500 uppercase mb-1">Gross Fare Revenue</span>
              <span className="text-4xl font-black text-blue-600">${grossRevenue.toFixed(2)}</span>
              <div className="flex gap-4 mt-2 text-xs font-bold text-gray-400">
                <span>Cash: <span className="text-gray-800 dark:text-gray-200">${cashRevenue.toFixed(0)}</span></span>
                <span>Credit: <span className="text-gray-800 dark:text-gray-200">${creditRevenue.toFixed(0)}</span></span>
                <span>Whish: <span className="text-gray-800 dark:text-gray-200">${whishRevenue.toFixed(0)}</span></span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center items-center text-center">
              <span className="text-xs font-bold text-gray-500 uppercase mb-1">Office Commission</span>
              <span className="text-3xl font-black text-green-600">${officeCommission.toFixed(2)}</span>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center items-center text-center">
              <span className="text-xs font-bold text-gray-500 uppercase mb-1">Fleet Expenses</span>
              <span className="text-3xl font-black text-red-500">-${officeExpenses.toFixed(2)}</span>
            </div>

            <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center items-center text-center ${trueNetProfit >= 0 ? 'bg-green-600 border-green-700 text-white' : 'bg-red-600 border-red-700 text-white'}`}>
              <span className="text-xs font-bold uppercase mb-1 opacity-80">True Net Profit</span>
              <span className="text-4xl font-black">${Math.abs(trueNetProfit).toFixed(2)}</span>
            </div>

          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Top Drivers */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-lg">Top Drivers (Revenue)</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-black text-gray-500 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Driver</th>
                    <th className="p-3">Trips</th>
                    <th className="p-3">Revenue</th>
                    <th className="p-3">Current Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {topDrivers.map((d, i) => (
                    <tr key={d.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-3 font-bold flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center text-xs">{i+1}</span>
                        {d.full_name}
                      </td>
                      <td className="p-3">{d.trips}</td>
                      <td className="p-3 font-bold">${d.revenue.toFixed(2)}</td>
                      <td className="p-3 font-bold">
                        {d.balance > 0 ? (
                          <span className="text-amber-500">Office Owes ${Math.abs(d.balance).toFixed(2)}</span>
                        ) : d.balance < 0 ? (
                          <span className="text-green-600">Owes Office ${Math.abs(d.balance).toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">Settled ($0.00)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vehicle Fleet Status */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-lg">Fleet Vehicles P&L</h3>
              </div>
              <div className="overflow-y-auto max-h-[300px]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-black text-gray-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Trips</th>
                      <th className="p-3">Co. Revenue</th>
                      <th className="p-3">Expenses</th>
                      <th className="p-3 text-right">Net Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topVehicles.map(v => (
                      <tr key={v.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="p-3 font-bold">{v.plate_number}</td>
                        <td className="p-3">{v.trips}</td>
                        <td className="p-3 text-green-600">${v.revenue.toFixed(2)}</td>
                        <td className="p-3 text-red-500">-${v.expenses.toFixed(2)}</td>
                        <td className="p-3 font-black text-right">
                          <span className={v.net >= 0 ? 'text-green-600' : 'text-red-500'}>
                            {v.net >= 0 ? '+' : ''}{v.net.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}
