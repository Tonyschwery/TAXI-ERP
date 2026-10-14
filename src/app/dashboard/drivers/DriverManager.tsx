'use client'

import { useState, useEffect } from 'react'
import { saveDriver, regenerateDriverToken } from './actions'
import { createClient } from '@/lib/supabase/client'

type Driver = any
type Category = any
type Vehicle = any

export default function DriverManager({
  initialDrivers,
  categories,
  vehicles,
  appUrl
}: {
  initialDrivers: Driver[];
  categories: Category[];
  vehicles: Vehicle[];
  appUrl: string;
}) {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers)
  const supabase = createClient()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('realtime:drivers_mgr')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setDrivers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        } else if (payload.eventType === 'INSERT') {
          setDrivers(prev => [payload.new, ...prev])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [privateCarDetails, setPrivateCarDetails] = useState('')
  const [vehicleType, setVehicleType] = useState('sedan')
  const [customPct, setCustomPct] = useState<string>('')
  const [isActive, setIsActive] = useState(true)

  const openNew = () => {
    setEditingId(null)
    setCode(`DRV-${(drivers.length + 1).toString().padStart(3, '0')}`)
    setFullName('')
    setPhone('')
    setCategoryId(categories[0]?.id || '')
    setVehicleId('')
    setPrivateCarDetails('')
    setVehicleType('sedan')
    setCustomPct('')
    setIsActive(true)
    setIsModalOpen(true)
  }

  const openEdit = (d: Driver) => {
    setEditingId(d.id)
    setCode(d.driver_code)
    setFullName(d.full_name)
    setPhone(d.phone)
    setCategoryId(d.category_id)
    setVehicleId(d.assigned_vehicle_id || '')
    setPrivateCarDetails(d.private_vehicle_details || '')
    setVehicleType(d.vehicle_type)
    setCustomPct(d.custom_office_pct_override !== null ? d.custom_office_pct_override.toString() : '')
    setIsActive(d.is_active)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await saveDriver({
        id: editingId || undefined,
        driver_code: code,
        full_name: fullName,
        phone,
        category_id: categoryId,
        assigned_vehicle_id: vehicleId || null,
        private_vehicle_details: privateCarDetails,
        vehicle_type: vehicleType,
        custom_office_pct_override: customPct,
        is_active: isActive
      })
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleRegenerate = async (id: string) => {
    if (!confirm('Are you sure? This will invalidate the driver\'s current portal link.')) return
    try {
      await regenerateDriverToken(id)
      window.location.reload()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Link copied to clipboard!')
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Add Driver
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Driver</th>
                <th className="px-6 py-4 font-medium">Vehicle & Category</th>
                <th className="px-6 py-4 font-medium">Effective Split</th>
                <th className="px-6 py-4 font-medium">Status / GPS</th>
                <th className="px-6 py-4 font-medium">Portal Access</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {drivers.map((d) => {

                // Calculate Effective Commission
                let officePct = 50
                let source = ''
                if (d.custom_office_pct_override !== null) {
                  officePct = d.custom_office_pct_override
                  source = 'Driver Override'
                } else if (d.vehicles?.custom_company_pct !== null && d.vehicles?.custom_company_pct !== undefined) {
                  officePct = d.vehicles.custom_company_pct
                  source = 'Vehicle Override'
                } else {
                  officePct = d.driver_categories?.default_office_commission_pct || 0
                  source = 'Category Default'
                }

                // Driver portal links sent via WhatsApp must ALWAYS point to the live hosted production URL
                const effectiveBaseUrl = (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')
                  ? appUrl
                  : 'https://taxi-erp.vercel.app'
                ).replace(/\/$/, '')

                const portalLink = `${effectiveBaseUrl}/driver-portal/${d.secure_access_token}`
                const whatsappLink = `https://wa.me/${d.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Welcome to the Taxi Dispatch! Your secure driver portal link is:\n${portalLink}\nDriver Code: ${d.driver_code}`)}`

                return (
                  <tr key={d.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${!d.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{d.full_name}</div>
                      <div className="text-xs text-gray-500">{d.driver_code} • {d.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded inline-block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        {d.driver_categories?.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {d.private_vehicle_details ? (
                          <span>{d.private_vehicle_details} • </span>
                        ) : null}
                        <span className="uppercase bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-bold text-[10px] text-gray-700 dark:text-gray-300">{d.vehicle_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-orange-600 dark:text-orange-400">{officePct}% Office</div>
                      <div className="text-xs text-gray-500 italic">{source}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-1 flex items-center">
                        {d.availability === 'available' && <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>}
                        {d.availability === 'busy' && <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>}
                        {d.availability === 'offline' && <span className="w-2 h-2 rounded-full bg-gray-500 mr-2"></span>}
                        <span className="capitalize text-xs font-medium">{d.availability}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        GPS: {d.last_gps_update ? new Date(d.last_gps_update).toLocaleTimeString() : 'Never'}
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => copyToClipboard(portalLink)} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded transition-colors font-medium">
                          Copy Link
                        </button>
                        <button onClick={() => copyToClipboard(d.secure_access_token)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded transition-colors font-medium" title="Copy raw portal access token">
                          Copy Token
                        </button>
                        {(() => {
                          const cleanPhone = d.phone.replace(/\D/g, '');
                          const wpLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Welcome to the Taxi Dispatch! Your secure driver portal link is:\n${portalLink}\nDriver Code: ${d.driver_code}`)}`;
                          return (
                            <a href={wpLink} target="_blank" rel="noreferrer" className="text-xs bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded transition-colors font-medium">
                              WhatsApp
                            </a>
                          )
                        })()}
                      </div>
                      <button onClick={() => handleRegenerate(d.id)} className="text-[10px] text-red-500 hover:text-red-700 underline block">
                        Regenerate Token
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEdit(d)}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 text-xs font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No drivers found.
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
              {editingId ? 'Edit Driver' : 'Add Driver'}
            </h2>

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Driver Code</label>
                  <input type="text" required value={code} onChange={e => setCode(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. DRV-01" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                  <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                  <input type="text" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="+961..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500">
                    <option value="" disabled>Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-800 mt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Type (For Pricing)</label>
                  <select required value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500">
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                    <option value="van">Van</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Model & Plate Number</label>
                  <input type="text" value={privateCarDetails} onChange={e => setPrivateCarDetails(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" placeholder="e.g. White Toyota Camry / Plate 123456" />
                </div>
                <div className="flex items-center pt-2 col-span-2">
                  <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
                  <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Active Account</label>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom Office Commission % Override (Highest Priority)</label>
                <p className="text-xs text-gray-500 mb-2">Leave blank to inherit from Category.</p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={customPct}
                  onChange={e => setCustomPct(e.target.value)}
                  placeholder="Inherit"
                  className="w-1/2 px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
