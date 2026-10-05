'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, exportToCSV } from '@/utils/reportExporter'

export default function LedgerClient({ drivers, vehicles, userId }: { drivers: any[], vehicles: any[], userId: string }) {
  const supabase = createClient()
  
  const [transactions, setTransactions] = useState<any[]>([])
  const [driverBalances, setDriverBalances] = useState<Record<string, number>>({})
  const [showModal, setShowModal] = useState(false)
  
  // Form State
  const [txType, setTxType] = useState('cash_received_from_driver')
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')

  const fetchLedger = async () => {
    const { data: txs } = await supabase
      .from('financial_transactions')
      .select('*, drivers(full_name), vehicles(plate_number)')
      .order('transaction_date', { ascending: false })
      .limit(200)
    
    if (txs) {
      setTransactions(txs)
      
      // Calculate balances
      const balances: Record<string, number> = {}
      drivers.forEach(d => balances[d.id] = 0)
      
      // We should ideally calculate this server-side or via a DB view, but we sum here for now
      // Note: A real app might fetch the sum directly to avoid pagination dropping older txs.
      // We will do a full aggregate fetch for balances just to be accurate.
      const { data: allTxs } = await supabase.from('financial_transactions').select('driver_id, balance_effect_on_driver').not('driver_id', 'is', null)
      if (allTxs) {
        allTxs.forEach(tx => {
          if (tx.driver_id) {
            balances[tx.driver_id] = (balances[tx.driver_id] || 0) + Number(tx.balance_effect_on_driver)
          }
        })
      }
      setDriverBalances(balances)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return
    
    const numAmt = Number(amount)
    let effect = 0

    // Net Balance Logic: 
    // Positive means Office Owes Driver (Driver is in credit)
    // Negative means Driver Owes Office (Driver is in debt)
    if (txType === 'cash_received_from_driver') {
      effect = numAmt // Driver pays us -> their debt reduces (moves towards positive)
    } else if (txType === 'cash_paid_to_driver') {
      effect = -numAmt // We pay driver -> their credit reduces (moves towards negative)
    } else if (txType === 'driver_advance') {
      effect = -numAmt // We give them a Salaf -> they owe us (moves towards negative)
    } else if (txType === 'driver_debt_adjustment') {
      effect = numAmt // Forgiving debt -> moves positive
    } else if (txType === 'rush_office_expense') {
      effect = 0 // Does not affect driver balance
    }

    const { error } = await supabase.from('financial_transactions').insert([{
      transaction_type: txType,
      driver_id: driverId || null,
      vehicle_id: vehicleId || null,
      amount: numAmt,
      balance_effect_on_driver: effect,
      description: desc,
      entered_by: userId
    }])

    if (!error) {
      await supabase.from('activity_logs').insert([{
        actor_id: userId,
        actor_name: 'Cashier',
        entity_type: 'financial_transaction',
        entity_id: null,
        action: 'financial_transaction_created',
        details: { type: txType, amount: numAmt, driver_id: driverId }
      }])
      setShowModal(false)
      setAmount('')
      setDesc('')
      fetchLedger()
    } else {
      alert('Error creating transaction')
    }
  }

  const handleSettle = async (dId: string, currentBalance: number) => {
    if (currentBalance === 0) return
    
    const isDriverOwes = currentBalance < 0
    const settleAmt = Math.abs(currentBalance)
    
    const txT = isDriverOwes ? 'cash_received_from_driver' : 'cash_paid_to_driver'
    const effect = isDriverOwes ? settleAmt : -settleAmt // Counteract the balance to zero

    if (!confirm(`Are you sure you want to settle $${settleAmt.toFixed(2)}? This will zero out the balance.`)) return

    const { error } = await supabase.from('financial_transactions').insert([{
      transaction_type: txT,
      driver_id: dId,
      amount: settleAmt,
      balance_effect_on_driver: effect,
      description: 'Account Settled & Zeroed Out',
      entered_by: userId
    }])

    if (!error) {
      await supabase.from('activity_logs').insert([{
        actor_id: userId,
        actor_name: 'Cashier',
        entity_type: 'financial_transaction',
        entity_id: null,
        action: 'financial_settlement',
        details: { driver_id: dId, amount: settleAmt }
      }])
      fetchLedger()
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* Left: Ledger History */}
      <div className="xl:col-span-2 space-y-6">
        <div className="flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-bold">Recent Transactions</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => exportToExcel([{ sheetName: 'Ledger', data: transactions }], 'Master_Ledger')}
              className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-2 rounded font-bold hover:bg-green-200"
            >
              Export Excel
            </button>
            <button 
              onClick={() => exportToCSV(transactions, 'Master_Ledger')}
              className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-2 rounded font-bold hover:bg-blue-200"
            >
              Export CSV
            </button>
            <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow ml-4">
              + New Cashier Transaction
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-black text-gray-500 uppercase text-xs">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Effect</th>
                <th className="p-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 whitespace-nowrap">{new Date(tx.transaction_date).toLocaleString()}</td>
                  <td className="p-3 font-bold text-gray-600 dark:text-gray-300 capitalize">{tx.transaction_type.replace(/_/g, ' ')}</td>
                  <td className="p-3 font-bold">{tx.drivers?.full_name || '-'}</td>
                  <td className="p-3 font-bold">${Number(tx.amount).toFixed(2)}</td>
                  <td className="p-3 font-bold">
                    {Number(tx.balance_effect_on_driver) > 0 ? (
                      <span className="text-green-600">+{Number(tx.balance_effect_on_driver).toFixed(2)}</span>
                    ) : Number(tx.balance_effect_on_driver) < 0 ? (
                      <span className="text-red-500">{Number(tx.balance_effect_on_driver).toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-400">0.00</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">{tx.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Driver Balances */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-6 border border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-bold mb-4">Driver Running Balances</h2>
        <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
          {drivers.map(d => {
            const bal = driverBalances[d.id] || 0
            if (bal === 0) return null // Only show active balances
            
            const isOwesOffice = bal < 0
            
            return (
              <div key={d.id} className={`p-4 rounded-xl border ${isOwesOffice ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-lg">{d.full_name}</div>
                  <div className={`font-black text-xl ${isOwesOffice ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    ${Math.abs(bal).toFixed(2)}
                  </div>
                </div>
                <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isOwesOffice ? 'text-green-600' : 'text-amber-600'}`}>
                  {isOwesOffice ? 'Driver Owes Office' : 'Office Owes Driver'}
                </div>
                <button 
                  onClick={() => handleSettle(d.id, bal)}
                  className={`w-full py-2 rounded-lg font-bold shadow-sm transition-transform active:scale-95 ${isOwesOffice ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                >
                  Settle Balance Now
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cashier Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Cashier Transaction</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 font-bold text-2xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-500 font-bold mb-1">Transaction Type</label>
                <select value={txType} onChange={e => setTxType(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black font-semibold" required>
                  <option value="cash_received_from_driver">Cash Received from Driver</option>
                  <option value="cash_paid_to_driver">Cash Paid to Driver</option>
                  <option value="driver_advance">Driver Advance (Salaf)</option>
                  <option value="driver_debt_adjustment">Driver Debt Adjustment</option>
                  <option value="rush_office_expense">Rush / Urgent Office Expense</option>
                </select>
              </div>
              
              {txType !== 'rush_office_expense' && (
                <div>
                  <label className="block text-gray-500 font-bold mb-1">Driver</label>
                  <select value={driverId} onChange={e => setDriverId(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required>
                    <option value="">-- Select Driver --</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-gray-500 font-bold mb-1">Amount ($)</label>
                <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black font-bold text-lg text-blue-600" required />
              </div>
              
              <div>
                <label className="block text-gray-500 font-bold mb-1">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" required placeholder="e.g. End of shift settlement..."></textarea>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg text-lg">
                Process Transaction
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
