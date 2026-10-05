'use client'

import { useState, useMemo } from 'react'
import { getCustomerHistory, updateCustomerNotes, deleteCustomer } from './actions'

type Customer = any

export default function CustomerManager({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers] = useState<Customer[]>(initialCustomers)
  const [search, setSearch] = useState('')
  
  // Slide-over state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const filtered = useMemo(() => {
    if (!search) return customers
    const lower = search.toLowerCase()
    return customers.filter(c => 
      (c.full_name && c.full_name.toLowerCase().includes(lower)) ||
      (c.phone && c.phone.includes(lower))
    )
  }, [customers, search])

  const handleRowClick = async (c: Customer) => {
    setSelectedCustomer(c)
    setNotes(c.notes || '')
    setLoadingHistory(true)
    setHistory([])
    try {
      const hist = await getCustomerHistory(c.id)
      setHistory(hist)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const closeDrawer = () => {
    setSelectedCustomer(null)
  }

  const handleSaveNotes = async () => {
    if (!selectedCustomer) return
    setSavingNotes(true)
    try {
      await updateCustomerNotes(selectedCustomer.id, notes)
      selectedCustomer.notes = notes // Mutate local safely for UI
      alert('Notes saved successfully!')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedCustomer) return
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${selectedCustomer.full_name}? This action cannot be undone.`)) return
    
    try {
      await deleteCustomer(selectedCustomer.id)
      alert('Customer deleted successfully.')
      window.location.reload() // Quickest way to refresh the whole table for now
    } catch (e: any) {
      alert(`Error deleting customer: ${e.message}`)
    }
  }

  return (
    <div className="relative">
      <div className="mb-6">
        <input 
          type="text" 
          placeholder="Search by name or phone..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-800 rounded-lg dark:bg-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Trips / Spend</th>
                <th className="px-6 py-4 font-medium">Default Pickup</th>
                <th className="px-6 py-4 font-medium">Last Order</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {filtered.map(c => (
                <tr 
                  key={c.id} 
                  onClick={() => handleRowClick(c)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">{c.full_name || 'Unknown'}</td>
                  <td className="px-6 py-4 font-mono text-gray-600 dark:text-gray-400">{c.phone}</td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900 dark:text-white">{c.total_trips} trips</span>
                    <br/>
                    <span className="text-xs text-green-600 dark:text-green-400 font-semibold">${c.total_spend?.toFixed(2) || '0.00'}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {c.default_pickup_address || <span className="italic text-gray-400">Not set</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:underline text-xs font-medium">View Profile</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No customers match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeDrawer}></div>
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Customer Profile</h2>
              <button onClick={closeDrawer} className="text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCustomer.full_name || 'Unknown'}</h3>
                <p className="text-gray-500 dark:text-gray-400 font-mono">{selectedCustomer.phone}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full font-medium">
                    {selectedCustomer.total_trips} Lifetime Trips
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium">
                    ${selectedCustomer.total_spend?.toFixed(2) || '0.00'} Total Spend
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900 dark:text-white">Operator Notes</label>
                <textarea 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-800 rounded-lg dark:bg-gray-950 dark:text-white focus:outline-none focus:border-blue-500" 
                  rows={3} 
                  placeholder="e.g., Prefers quiet car, building next to pharmacy"
                />
                <button 
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="w-full py-2 bg-gray-900 dark:bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Order History (Last 20)</label>
                {loadingHistory ? (
                  <div className="text-sm text-gray-500">Loading history...</div>
                ) : (
                  <div className="space-y-3">
                    {history.length === 0 ? (
                      <p className="text-sm text-gray-500">No past orders.</p>
                    ) : (
                      history.map(h => (
                        <div key={h.id} className="p-3 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-950 text-sm">
                          <div className="flex justify-between font-semibold text-gray-900 dark:text-white mb-1">
                            <span>#{h.order_number}</span>
                            <span className="text-green-600 dark:text-green-400">${h.final_fare?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">{new Date(h.created_at).toLocaleString()}</div>
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium text-gray-900 dark:text-gray-400">Pick:</span> {h.pickup_address}
                          </div>
                          <div className="text-gray-700 dark:text-gray-300 mt-1">
                            <span className="font-medium text-gray-900 dark:text-gray-400">Drop:</span> {h.destination_address}
                          </div>
                          <div className="mt-2 flex justify-between items-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold 
                              ${h.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                              {h.status}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-1 rounded border border-gray-200 dark:border-gray-700">
                              {h.payment_method_code}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              <div className="pt-8 pb-4 border-t border-gray-200 dark:border-gray-800">
                <button 
                  onClick={handleDelete}
                  className="w-full py-2.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-800/40 dark:text-red-400 font-bold rounded-lg transition-colors border border-red-200 dark:border-red-900/50"
                >
                  Delete Customer Permanently
                </button>
                <p className="text-center text-[10px] text-gray-400 mt-2">Warning: This deletes the customer from the database forever.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
