'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportVehicleStatementToPDF, exportToExcel, exportToCSV } from '@/utils/reportExporter'

export default function VehicleStatementsClient({ vehicles }: { vehicles: any[] }) {
  const supabase = createClient()
  
  const [filterRange, setFilterRange] = useState('month')
  const [filterVehicle, setFilterVehicle] = useState(vehicles[0]?.id || '')
  
  const [orders, setOrders] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchData = async () => {
    if (!filterVehicle) return
    setIsLoading(true)

    let startDate = new Date()
    if (filterRange === 'today') startDate.setHours(0,0,0,0)
    if (filterRange === 'week') startDate.setDate(startDate.getDate() - 7)
    if (filterRange === 'month') startDate.setMonth(startDate.getMonth() - 1)
    if (filterRange === 'custom') startDate = new Date('2020-01-01')

    const startIso = startDate.toISOString()

    const { data: ord } = await supabase
      .from('orders')
      .select('*, drivers(full_name)')
      .eq('assigned_vehicle_id', filterVehicle)
      .eq('status', 'completed')
      .gte('created_at', startIso)
      .order('created_at', { ascending: true })

    const { data: exp } = await supabase
      .from('vehicle_expenses')
      .select('*, profiles(full_name)')
      .eq('vehicle_id', filterVehicle)
      .gte('expense_date', startIso)
      .order('expense_date', { ascending: true })

    setOrders(ord || [])
    setExpenses(exp || [])
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [filterRange, filterVehicle])

  // Calculations
  const totalCompleted = orders.length
  const totalGross = orders.reduce((sum, o) => sum + Number(o.final_fare), 0)
  
  const companyShare = orders.reduce((sum, o) => sum + Number(o.office_share_amount), 0)
  const driverShare = totalGross - companyShare

  const fuelExp = expenses.filter(e => e.expense_category === 'fuel').reduce((sum, e) => sum + Number(e.amount), 0)
  const maintExp = expenses.filter(e => e.expense_category === 'maintenance' || e.expense_category === 'repairs').reduce((sum, e) => sum + Number(e.amount), 0)
  const otherExp = expenses.filter(e => !['fuel', 'maintenance', 'repairs'].includes(e.expense_category)).reduce((sum, e) => sum + Number(e.amount), 0)
  
  const totalExp = fuelExp + maintExp + otherExp

  // Net Result for the Company Vehicle
  // It is Gross Revenue - Driver Share - Total Expenses
  // Or simply: Company Share (which is Gross - Driver Share) - Total Expenses
  const netResult = companyShare - totalExp

  // Unified Table
  const unifiedItems = [
    ...orders.map(o => ({
      id: `ord-${o.id}`,
      date: o.created_at,
      type: 'Trip',
      category: 'Revenue',
      desc: `Order #${o.order_number} by ${o.drivers?.full_name || 'Unknown'}`,
      amount: Number(o.office_share_amount), // We log the company revenue portion
      raw: o
    })),
    ...expenses.map(e => ({
      id: `exp-${e.id}`,
      date: e.expense_date,
      type: 'Expense',
      category: e.expense_category,
      desc: e.description || e.expense_category,
      amount: -Number(e.amount),
      raw: e
    }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="space-y-6">
      
      {/* Controls */}
      <div className="flex gap-4 items-end bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vehicle</label>
          <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black font-bold">
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} ({v.make} {v.model})</option>)}
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
            
            <div className={`p-6 rounded-2xl shadow-sm border ${netResult >= 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20' : 'bg-red-50 border-red-200 dark:bg-red-900/20'}`}>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Net Vehicle Result</div>
              <div className={`text-3xl font-black mb-2 ${netResult >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                ${Math.abs(netResult).toFixed(2)}
              </div>
              <div className={`font-bold uppercase ${netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netResult >= 0 ? 'PROFITABLE (COMPANY SHARE EXCEEDS EXPENSES)' : 'LOSS (EXPENSES EXCEED COMPANY SHARE)'}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3 text-sm">
              <h3 className="font-bold text-lg mb-2">Performance Overview</h3>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Total Completed Trips</span> <span className="font-bold">{totalCompleted}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Gross Revenue Generated</span> <span className="font-bold">${totalGross.toFixed(2)}</span></div>
              
              <div className="pt-2 text-xs font-bold text-gray-400 uppercase">Revenue Split</div>
              <div className="flex justify-between"><span className="text-gray-500">Driver Commission Share</span> <span className="font-bold text-orange-600">${driverShare.toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Company Commission Share</span> <span className="font-bold text-green-600">${companyShare.toFixed(2)}</span></div>
              
              <div className="pt-2 text-xs font-bold text-gray-400 uppercase">Operating Expenses</div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Fuel</span> <span className="text-red-500">-${fuelExp.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Maintenance & Repairs</span> <span className="text-red-500">-${maintExp.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs border-b pb-2"><span className="text-gray-500">Other Expenses</span> <span className="text-red-500">-${otherExp.toFixed(2)}</span></div>

              <div className="flex justify-between font-bold pt-2"><span className="text-gray-500">Total Operational Cost</span> <span className="text-red-600">-${totalExp.toFixed(2)}</span></div>
            </div>

          </div>

          {/* Unified Statement Table */}
          <div className="xl:col-span-2 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col h-[700px]">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-lg">Itemized Trip & Expense Ledger</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const v = vehicles.find(veh => veh.id === filterVehicle)
                    exportVehicleStatementToPDF(v, filterRange, {
                      totalCompleted, totalGross, companyShare, driverShare,
                      fuel: fuelExp, maint: maintExp, other: otherExp, netResult
                    }, unifiedItems)
                  }}
                  className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 rounded font-bold hover:bg-red-200"
                >
                  Export PDF
                </button>
                <button 
                  onClick={() => exportToExcel([{ sheetName: 'Vehicle Ledger', data: unifiedItems }], `Vehicle_Statement_${filterVehicle}`)}
                  className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded font-bold hover:bg-green-200"
                >
                  Excel
                </button>
                <button 
                  onClick={() => exportToCSV(unifiedItems, `Vehicle_Statement_${filterVehicle}`)}
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
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount (Company Net)</th>
                  </tr>
                </thead>
                <tbody>
                  {unifiedItems.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No activity for this vehicle in this period.</td></tr>}
                  {unifiedItems.map((item) => (
                    <tr key={item.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-3 whitespace-nowrap text-xs">{new Date(item.date).toLocaleString()}</td>
                      <td className="p-3">
                        {item.type === 'Trip' ? 
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">TRIP</span> : 
                          <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] font-bold">EXPENSE</span>}
                      </td>
                      <td className="p-3 font-bold text-xs uppercase">{item.category}</td>
                      <td className="p-3 text-xs">{item.desc}</td>
                      <td className="p-3 text-right font-black">
                        {item.amount > 0 ? (
                          <span className="text-green-600">+{item.amount.toFixed(2)}</span>
                        ) : item.amount < 0 ? (
                          <span className="text-red-500">{item.amount.toFixed(2)}</span>
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
