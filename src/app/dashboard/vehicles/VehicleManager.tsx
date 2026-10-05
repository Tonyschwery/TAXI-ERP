'use client'

import { useState } from 'react'
import { saveVehicle } from './actions'

type Vehicle = any 

export default function VehicleManager({ initialVehicles }: { initialVehicles: Vehicle[] }) {
  const [vehicles] = useState<Vehicle[]>(initialVehicles)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [plate, setPlate] = useState('')
  const [makeModel, setMakeModel] = useState('')
  const [year, setYear] = useState<string>('')
  const [color, setColor] = useState('')
  const [vehicleType, setVehicleType] = useState('sedan')
  const [isCompany, setIsCompany] = useState(true)
  const [customOfficePct, setCustomOfficePct] = useState<string>('')
  const [notes, setNotes] = useState('')

  const openNew = () => {
    setEditingId(null)
    setPlate('')
    setMakeModel('')
    setYear('')
    setColor('')
    setVehicleType('sedan')
    setIsCompany(true)
    setCustomOfficePct('')
    setNotes('')
    setIsModalOpen(true)
  }

  const openEdit = (v: Vehicle) => {
    setEditingId(v.id)
    setPlate(v.plate_number)
    setMakeModel(v.make_model)
    setYear(v.year?.toString() || '')
    setColor(v.color || '')
    setVehicleType(v.vehicle_type)
    setIsCompany(v.is_company_owned)
    setCustomOfficePct(v.custom_company_pct !== null ? v.custom_company_pct.toString() : '')
    setNotes(v.notes || '')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await saveVehicle({
        id: editingId || undefined,
        plate_number: plate,
        make_model: makeModel,
        year: year ? parseInt(year) : null,
        color: color || null,
        vehicle_type: vehicleType,
        is_company_owned: isCompany,
        custom_company_pct: customOfficePct !== '' ? parseFloat(customOfficePct) : null,
        notes: notes || null
      })
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleActionClick = () => {
    alert("Coming in Accounting phase!")
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button 
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Add Vehicle
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Plate / Model</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Ownership</th>
                <th className="px-6 py-4 font-medium">Commission Split</th>
                <th className="px-6 py-4 font-medium">Assigned Driver</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {vehicles.map((v) => {
                const activeDrivers = v.drivers?.filter((d: any) => d.is_active) || []
                const driverName = activeDrivers.length > 0 ? activeDrivers[0].full_name : 'Unassigned'
                
                return (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{v.plate_number}</div>
                      <div className="text-xs text-gray-500">{v.year} {v.color} {v.make_model}</div>
                    </td>
                    <td className="px-6 py-4 uppercase text-xs font-semibold text-gray-500">{v.vehicle_type}</td>
                    <td className="px-6 py-4">
                      {v.is_company_owned ? (
                        <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded text-xs font-bold">Company</span>
                      ) : (
                        <span className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-1 rounded text-xs">External</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {v.custom_company_pct !== null ? (
                        <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900 px-2 py-1 rounded">
                          {v.custom_company_pct}% Office
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Inherited</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700 dark:text-gray-300">
                      {driverName}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button onClick={handleActionClick} className="text-green-600 hover:text-green-800 dark:text-green-500 dark:hover:text-green-400 text-xs font-medium">
                        Log Expense
                      </button>
                      <button onClick={handleActionClick} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium">
                        Statement
                      </button>
                      <button onClick={() => openEdit(v)} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 text-xs font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No vehicles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Edit Vehicle' : 'Add Vehicle'}
            </h2>
            
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plate Number</label>
                  <input type="text" required value={plate} onChange={e => setPlate(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. B 123456" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Make & Model</label>
                  <input type="text" required value={makeModel} onChange={e => setMakeModel(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. Toyota Camry" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
                  <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. 2022" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                  <input type="text" value={color} onChange={e => setColor(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. White" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Type</label>
                  <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500">
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                    <option value="van">Van</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <input type="checkbox" id="isCompanyVeh" checked={isCompany} onChange={e => setIsCompany(e.target.checked)} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
                  <label htmlFor="isCompanyVeh" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Company Owned</label>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom Company Commission % Override</label>
                <p className="text-xs text-gray-500 mb-2">Leave blank to inherit from the driver's category default.</p>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={customOfficePct}
                    onChange={e => setCustomOfficePct(e.target.value)}
                    placeholder="Inherit"
                    className="w-1/2 px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <div className="w-1/2 text-sm text-gray-500 dark:text-gray-400">
                    {customOfficePct !== '' ? (
                      <>Driver gets: <span className="font-bold text-green-600 dark:text-green-400">{100 - parseFloat(customOfficePct)}%</span></>
                    ) : (
                      <span className="italic">Standard Split</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" rows={2} />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
