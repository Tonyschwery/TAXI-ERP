'use client'

import { useState } from 'react'
import { savePricingRule, savePaymentMethod, deletePricingRule } from './actions'
import { calculateFare, PricingRule } from '@/utils/pricingCalculator'

export default function PricingManager({ 
  initialRules, 
  initialPaymentMethods 
}: { 
  initialRules: any[];
  initialPaymentMethods: any[];
}) {
  const [activeTab, setActiveTab] = useState<'rules' | 'payment'>('rules')
  const [rules] = useState<any[]>(initialRules)
  const [payments] = useState<any[]>(initialPaymentMethods)

  // Modals state
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rule Form State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [vehicleType, setVehicleType] = useState('sedan')
  const [baseFare, setBaseFare] = useState<string>('0')
  const [pricePerKm, setPricePerKm] = useState<string>('0')
  const [minFare, setMinFare] = useState<string>('0')
  const [nightMultiplier, setNightMultiplier] = useState<string>('1.5')
  const [nightStart, setNightStart] = useState<string>('22')
  const [nightEnd, setNightEnd] = useState<string>('6')
  const [extraStop, setExtraStop] = useState<string>('0')
  const [waitingFee, setWaitingFee] = useState<string>('0')
  const [isRuleActive, setIsRuleActive] = useState(true)

  // Payment Form State
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [payCode, setPayCode] = useState('')
  const [payName, setPayName] = useState('')
  const [settlementType, setSettlementType] = useState('driver_collects_cash')
  const [isPayActive, setIsPayActive] = useState(true)

  // Calculator State
  const [calcDistance, setCalcDistance] = useState<string>('10')
  const [calcVehicle, setCalcVehicle] = useState('sedan')
  const [calcTime, setCalcTime] = useState<string>('14:00') // 24h format
  const [calcExtra, setCalcExtra] = useState<string>('0')
  const [previewResult, setPreviewResult] = useState<any>(null)

  const openRuleModal = (r?: any) => {
    if (r) {
      setEditingRuleId(r.id)
      setRuleName(r.name)
      setVehicleType(r.vehicle_type)
      setBaseFare(r.base_fare.toString())
      setPricePerKm(r.price_per_km.toString())
      setMinFare(r.minimum_fare.toString())
      setNightMultiplier(r.night_multiplier.toString())
      setNightStart(r.night_start_hour.toString())
      setNightEnd(r.night_end_hour.toString())
      setExtraStop(r.extra_stop_fee.toString())
      setWaitingFee(r.waiting_fee_per_15min.toString())
      setIsRuleActive(r.is_active)
    } else {
      setEditingRuleId(null)
      setRuleName('Standard Sedan')
      setVehicleType('sedan')
      setBaseFare('0')
      setPricePerKm('0')
      setMinFare('0')
      setNightMultiplier('1.5')
      setNightStart('22')
      setNightEnd('6')
      setExtraStop('0')
      setWaitingFee('0')
      setIsRuleActive(true)
    }
    setError(null)
    setIsRuleModalOpen(true)
  }

  const openPaymentModal = (p?: any) => {
    if (p) {
      setEditingPaymentId(p.id)
      setPayCode(p.code)
      setPayName(p.display_name)
      setSettlementType(p.settlement_type)
      setIsPayActive(p.is_active)
    } else {
      setEditingPaymentId(null)
      setPayCode('')
      setPayName('')
      setSettlementType('driver_collects_cash')
      setIsPayActive(true)
    }
    setError(null)
    setIsPaymentModalOpen(true)
  }

  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await savePricingRule({
        id: editingRuleId || undefined,
        name: ruleName,
        vehicle_type: vehicleType,
        base_fare: baseFare,
        price_per_km: pricePerKm,
        minimum_fare: minFare,
        night_multiplier: nightMultiplier,
        night_start_hour: nightStart,
        night_end_hour: nightEnd,
        extra_stop_fee: extraStop,
        waiting_fee_per_15min: waitingFee,
        is_active: isRuleActive
      })
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await deletePricingRule(id);
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await savePaymentMethod({
        id: editingPaymentId || undefined,
        code: payCode,
        display_name: payName,
        settlement_type: settlementType,
        is_active: isPayActive
      })
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const runCalculator = () => {
    // Construct a dummy date with the specified time
    const [hours, minutes] = calcTime.split(':')
    const testDate = new Date()
    testDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0)

    const res = calculateFare(
      parseFloat(calcDistance) || 0,
      calcVehicle,
      testDate,
      parseFloat(calcExtra) || 0,
      rules as PricingRule[]
    )
    setPreviewResult(res)
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          className={`px-6 py-3 font-medium text-sm focus:outline-none ${activeTab === 'rules' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          onClick={() => setActiveTab('rules')}
        >
          Automatic Pricing Rules
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm focus:outline-none ${activeTab === 'payment' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          onClick={() => setActiveTab('payment')}
        >
          Payment Methods
        </button>
      </div>

      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Pricing Structures</h2>
              <button onClick={() => openRuleModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">
                + Add Rule
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((r) => (
                <div key={r.id} className={`p-5 rounded-xl border ${r.is_active ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800' : 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-900 opacity-60'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {r.name}
                        {!r.is_active && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded">INACTIVE</span>}
                      </h3>
                      <span className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded mt-1 inline-block">{r.vehicle_type}</span>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => openRuleModal(r)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-sm font-medium">Edit</button>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between"><span>Price per KM:</span> <span className="font-semibold text-gray-900 dark:text-gray-200">{r.price_per_km.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Minimum Fare:</span> <span className="font-semibold text-gray-900 dark:text-gray-200">{r.minimum_fare.toFixed(2)}</span></div>
                    <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between"><span>Night Rate ({r.night_start_hour}:00 - {r.night_end_hour}:00):</span> <span className="font-semibold text-purple-600 dark:text-purple-400">{r.night_multiplier}x</span></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calculator Sidebar */}
          <div className="xl:col-span-1">
            <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Fare Calculator Preview</h2>
              <p className="text-xs text-gray-500 mb-6">Test your pricing rules live without creating an order.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle Type / Tier</label>
                  <select value={calcVehicle} onChange={e => setCalcVehicle(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white">
                    {Array.from(new Set([...rules.map(r => r.vehicle_type), 'sedan', 'suv/van'])).map(vt => (
                      <option key={vt as string} value={vt as string}>{(vt as string).charAt(0).toUpperCase() + (vt as string).slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Distance (km)</label>
                    <input type="number" step="0.1" value={calcDistance} onChange={e => setCalcDistance(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Time (HH:MM)</label>
                    <input type="time" value={calcTime} onChange={e => setCalcTime(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Extra Charges (Stops, etc)</label>
                  <input type="number" step="0.1" value={calcExtra} onChange={e => setCalcExtra(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white" />
                </div>
                <button onClick={runCalculator} className="w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium text-sm transition-opacity hover:opacity-90">
                  Calculate Fare
                </button>

                {previewResult && (
                  <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg">
                    {previewResult.breakdown.error ? (
                      <div className="text-red-600 text-sm font-medium">{previewResult.breakdown.error}</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                          <span>Distance Cost:</span> <span>{previewResult.breakdown.distanceCost.toFixed(2)}</span>
                        </div>
                        {previewResult.breakdown.isNightMultiplierApplied && (
                          <div className="flex justify-between text-sm text-purple-600 dark:text-purple-400">
                            <span>Night Multiplier:</span> <span>x{previewResult.breakdown.multiplier}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-medium text-gray-900 dark:text-gray-200 pt-1 border-t border-gray-200 dark:border-gray-700">
                          <span>Subtotal:</span> <span>{previewResult.breakdown.subtotal.toFixed(2)}</span>
                        </div>
                        {previewResult.breakdown.minimumApplied && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 text-right">Bumped to Minimum Fare</div>
                        )}
                        {previewResult.breakdown.extraCharges > 0 && (
                          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                            <span>Extra Charges:</span> <span>+{previewResult.breakdown.extraCharges.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span>Final Fare:</span> <span>{previewResult.finalFare.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payment' && (
        <div className="max-w-4xl space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Methods</h2>
            <button onClick={() => openPaymentModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">
              + Add Payment Method
            </button>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Method Code</th>
                  <th className="px-6 py-4 font-medium">Display Name</th>
                  <th className="px-6 py-4 font-medium">Settlement Flow</th>
                  <th className="px-6 py-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-mono text-gray-900 dark:text-gray-100">{p.code}</td>
                    <td className="px-6 py-4 font-medium">{p.display_name}</td>
                    <td className="px-6 py-4">
                      {p.settlement_type === 'driver_collects_cash' ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">Driver Collects (Cash)</span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">Office Receives (Digital/Credit)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openPaymentModal(p)} className="text-blue-600 hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold mb-4">{editingRuleId ? 'Edit Rule' : 'Add Rule'}</h2>
            {error && <div className="bg-red-900/50 border-red-500 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}
            <form onSubmit={handleRuleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Rule Name</label>
                  <input type="text" required value={ruleName} onChange={e => setRuleName(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Vehicle Type (or Pricing Tier)</label>
                  <input type="text" list="vehicle-types-list" required value={vehicleType} onChange={e => setVehicleType(e.target.value)} placeholder="e.g. sedan, suv/van" className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" />
                  <datalist id="vehicle-types-list">
                    <option value="sedan" />
                    <option value="suv/van" />
                  </datalist>
                </div>
                {/* Base fare removed per client request */}
                <div><label className="block text-sm mb-1">Price per KM</label><input type="number" step="0.01" required value={pricePerKm} onChange={e=>setPricePerKm(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Minimum Fare</label><input type="number" step="0.01" required value={minFare} onChange={e=>setMinFare(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Night Multiplier</label><input type="number" step="0.01" required value={nightMultiplier} onChange={e=>setNightMultiplier(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Night Start (Hour)</label><input type="number" min="0" max="23" required value={nightStart} onChange={e=>setNightStart(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Night End (Hour)</label><input type="number" min="0" max="23" required value={nightEnd} onChange={e=>setNightEnd(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Extra Stop Fee</label><input type="number" step="0.01" required value={extraStop} onChange={e=>setExtraStop(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
                <div><label className="block text-sm mb-1">Wait Fee (per 15m)</label><input type="number" step="0.01" required value={waitingFee} onChange={e=>setWaitingFee(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800 mt-4">
                <button type="button" onClick={() => setIsRuleModalOpen(false)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">{editingPaymentId ? 'Edit Payment Method' : 'Add Payment Method'}</h2>
            {error && <div className="bg-red-900/50 border-red-500 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Method Code (e.g. &apos;stripe&apos;)</label>
                <input type="text" required value={payCode} onChange={e => setPayCode(e.target.value)} disabled={!!editingPaymentId} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm mb-1">Display Name</label>
                <input type="text" required value={payName} onChange={e => setPayName(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800" />
              </div>
              <div>
                <label className="block text-sm mb-1">Settlement Flow</label>
                <select required value={settlementType} onChange={e => setSettlementType(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-950 dark:border-gray-800">
                  <option value="driver_collects_cash">Driver Collects (Cash)</option>
                  <option value="office_receives_digital_or_credit">Office Receives (Digital/Credit)</option>
                </select>
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="payActive" checked={isPayActive} onChange={e => setIsPayActive(e.target.checked)} className="mr-2" />
                <label htmlFor="payActive">Active Method</label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800 mt-4">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
