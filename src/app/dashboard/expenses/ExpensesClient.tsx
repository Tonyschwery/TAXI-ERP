'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, exportToCSV } from '@/utils/reportExporter'

export default function ExpensesClient({ vehicles, drivers, userId }: { vehicles: any[], drivers: any[], userId: string }) {
  const supabase = createClient()
  
  const [expenses, setExpenses] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [filterRange, setFilterRange] = useState('month') // day, week, month, custom
  const [filterVehicle, setFilterVehicle] = useState('all')
  
  // Form State
  const [formVehicle, setFormVehicle] = useState(vehicles[0]?.id || '')
  const [formDriver, setFormDriver] = useState('')
  const [formCategory, setFormCategory] = useState('fuel')
  const [formAmount, setFormAmount] = useState('')
  const [formPaidBy, setFormPaidBy] = useState('office')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formDesc, setFormDesc] = useState('')

  const fetchData = async () => {
    // Determine date range
    let startDate = new Date()
    if (filterRange === 'day') startDate.setHours(0,0,0,0)
    if (filterRange === 'week') startDate.setDate(startDate.getDate() - 7)
    if (filterRange === 'month') startDate.setMonth(startDate.getMonth() - 1)
    if (filterRange === 'custom') startDate = new Date('2020-01-01') // simplistic for now

    const startIso = startDate.toISOString()

    // Fetch expenses
    let eq = supabase.from('vehicle_expenses').select('*, vehicles(plate_number), drivers(full_name)').gte('expense_date', startIso)
    if (filterVehicle !== 'all') eq = eq.eq('vehicle_id', filterVehicle)
    const { data: exp } = await eq.order('expense_date', { ascending: false })
    
    // Fetch completed orders for revenue
    let oq = supabase.from('orders').select('*').eq('status', 'completed').gte('created_at', startIso)
    if (filterVehicle !== 'all') oq = oq.eq('assigned_vehicle_id', filterVehicle)
    const { data: ord } = await oq

    setExpenses(exp || [])
    setOrders(ord || [])
  }

  useEffect(() => {
    fetchData()
  }, [filterRange, filterVehicle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formAmount || !formVehicle) return

    const amount = parseFloat(formAmount)
    
    // 1. Insert Expense
    const { error } = await supabase.from('vehicle_expenses').insert([{
      vehicle_id: formVehicle,
      driver_id: formDriver || null,
      expense_category: formCategory,
      amount: amount,
      paid_by: formPaidBy,
      expense_date: formDate,
      description: formDesc,
      entered_by: userId
    }])

    if (error) {
      alert('Error saving expense')
      return
    }

    // 2. If paid by driver, credit them
    if (formPaidBy === 'driver' && formDriver) {
      await supabase.from('financial_transactions').insert([{
        transaction_type: 'expense_reimbursement',
        driver_id: formDriver,
        vehicle_id: formVehicle,
        amount: amount,
        balance_effect_on_driver: amount, // Positive to credit driver
        description: `Reimbursement for ${formCategory} (${formDesc})`,
        entered_by: userId
      }])
    }

    // Reset
    setFormAmount('')
    setFormDesc('')
    fetchData()
  }

  // Calculate Vehicle P&L Stats
  const calculateVehicleStats = (vId: string) => {
    const vOrders = orders.filter(o => o.assigned_vehicle_id === vId)
    const vExp = expenses.filter(e => e.vehicle_id === vId)

    const revenue = vOrders.reduce((sum, o) => sum + (Number(o.final_fare) || 0), 0)
    // Driver share is Final Fare - Office Share
    const driverShare = vOrders.reduce((sum, o) => sum + ((Number(o.final_fare) || 0) - (Number(o.office_share_amount) || 0)), 0)
    
    const fuel = vExp.filter(e => e.expense_category === 'fuel').reduce((sum, e) => sum + Number(e.amount), 0)
    const otherExp = vExp.filter(e => e.expense_category !== 'fuel').reduce((sum, e) => sum + Number(e.amount), 0)

    const netResult = revenue - driverShare - fuel - otherExp
    return { revenue, driverShare, fuel, otherExp, netResult }
  }

  // Filter vehicles to show stats for
  const displayedVehicles = filterVehicle === 'all' ? vehicles : vehicles.filter(v => v.id === filterVehicle)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* Left: Input Form */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-6 border border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-bold mb-4">Record Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-gray-500 font-bold mb-1">Vehicle *</label>
            <select value={formVehicle} onChange={e => setFormVehicle(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} ({v.make} {v.model})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 font-bold mb-1">Driver (Optional)</label>
            <select value={formDriver} onChange={e => setFormDriver(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black">
              <option value="">-- None --</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 font-bold mb-1">Category</label>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required>
                <option value="fuel">Fuel</option>
                <option value="maintenance">Maintenance</option>
                <option value="repairs">Repairs</option>
                <option value="oil">Oil Change</option>
                <option value="tires">Tires</option>
                <option value="washing">Washing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-500 font-bold mb-1">Amount ($) *</label>
              <input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 font-bold mb-1">Paid By</label>
              <select value={formPaidBy} onChange={e => setFormPaidBy(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required>
                <option value="office">Office / Company</option>
                <option value="driver">Driver (Out of Pocket)</option>
              </select>
              {formPaidBy === 'driver' && <p className="text-xs text-orange-500 mt-1">Driver balance will be credited.</p>}
            </div>
            <div>
              <label className="block text-gray-500 font-bold mb-1">Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 font-bold mb-1">Description</label>
            <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" rows={2} required></textarea>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow">
            Save Expense
          </button>
        </form>
      </div>

      {/* Right: Summary & List */}
      <div className="xl:col-span-2 space-y-6">
        
        {/* Filters */}
        <div className="flex gap-4 items-end bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Time Range</label>
            <select value={filterRange} onChange={e => setFilterRange(e.target.value)} className="border p-2 rounded bg-gray-50 dark:bg-black font-bold">
              <option value="day">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="custom">All Time</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vehicle</label>
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="border p-2 rounded bg-gray-50 dark:bg-black font-bold">
              <option value="all">All Vehicles</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
            </select>
          </div>
        </div>

        {/* P&L Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedVehicles.map(v => {
            const stats = calculateVehicleStats(v.id)
            if (stats.revenue === 0 && stats.fuel === 0 && stats.otherExp === 0) return null // Hide zero-activity

            return (
              <div key={v.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="font-black text-lg mb-2">{v.plate_number} <span className="text-gray-500 font-normal text-sm">({v.make})</span></div>
                <div className="space-y-1 text-sm font-semibold">
                  <div className="flex justify-between"><span className="text-gray-500">Gross Revenue</span> <span className="text-green-600">${stats.revenue.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Driver % Share</span> <span className="text-red-500">-${stats.driverShare.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Fuel</span> <span className="text-red-500">-${stats.fuel.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Other Exp</span> <span className="text-red-500">-${stats.otherExp.toFixed(2)}</span></div>
                  <div className="border-t pt-1 mt-1 flex justify-between font-black text-lg">
                    <span>Net Result</span> 
                    <span className={stats.netResult >= 0 ? 'text-green-600' : 'text-red-600'}>${stats.netResult.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Expense List */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <span className="font-bold text-lg">Expense History</span>
            <div className="flex gap-2">
              <button 
                onClick={() => exportToExcel([{ sheetName: 'Expenses', data: expenses }], 'Expenses_Ledger')}
                className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded font-bold hover:bg-green-200"
              >
                Excel
              </button>
              <button 
                onClick={() => exportToCSV(expenses, 'Expenses_Ledger')}
                className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded font-bold hover:bg-blue-200"
              >
                CSV
              </button>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-black text-gray-500 uppercase text-xs">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Category</th>
                <th className="p-3">Description</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Paid By</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">No expenses found for this period.</td></tr>}
              {expenses.map(exp => (
                <tr key={exp.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 whitespace-nowrap">{new Date(exp.expense_date).toLocaleDateString()}</td>
                  <td className="p-3 font-bold">{exp.vehicles?.plate_number}</td>
                  <td className="p-3 capitalize">{exp.expense_category}</td>
                  <td className="p-3">{exp.description}</td>
                  <td className="p-3 font-bold text-red-600">-${Number(exp.amount).toFixed(2)}</td>
                  <td className="p-3">
                    {exp.paid_by === 'driver' ? 
                      <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">Driver Reimburse</span> : 
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">Office</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
