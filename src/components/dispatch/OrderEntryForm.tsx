'use client'

import { useState, useEffect, useRef } from 'react'
import { calculateFare, PricingRule } from '@/utils/pricingCalculator'
import {
  getActiveRulesAndMethods,
  fetchRouteDetails,
  fetchNearestDrivers,
  submitOrder,
  lookupCustomer,
  searchPlaces,
  getPlaceDetails,
  operatorCancelOrder,
  reverseGeocodeLocation
} from './actions'
import { createClient } from '@/lib/supabase/client'
import WhatsAppButton from '@/components/ui/WhatsAppButton'

interface OrderEntryFormProps {
  initialOrder?: any
  onSaved?: () => void
  onRouteUpdate?: (
    pickup: [number, number] | null,
    dest: [number, number] | null,
    polyline: string | null,
    distanceKm?: number,
    durationMins?: number
  ) => void
  externalPickup?: [number, number] | null
  selectedDriverId?: string | null
  onDriverSelect?: (driverId: string) => void
  allDrivers?: any[]
}

export default function OrderEntryForm({
  initialOrder = null,
  onSaved,
  onRouteUpdate,
  externalPickup = null,
  selectedDriverId = null,
  onDriverSelect,
  allDrivers = []
}: OrderEntryFormProps) {
  // Config state
  const [rules, setRules] = useState<PricingRule[]>([])
  const [methods, setMethods] = useState<any[]>([])

  // Form State
  const [phone, setPhone] = useState(initialOrder?.customer_phone || '')
  const [name, setName] = useState(initialOrder?.customer_name || '')
  const [customerId, setCustomerId] = useState<string | null>(initialOrder?.customer_id || null)
  const [customerData, setCustomerData] = useState<any>(null)

  const [vehicleType, setVehicleType] = useState(initialOrder?.vehicle_type || 'sedan')
  const [paymentMethod, setPaymentMethod] = useState(initialOrder?.payment_method_code || 'cash')

  const [pickupAddr, setPickupAddr] = useState(initialOrder?.pickup_address || '')
  const [pickupLat, setPickupLat] = useState<number | null>(initialOrder?.pickup_lat || null)
  const [pickupLng, setPickupLng] = useState<number | null>(initialOrder?.pickup_lng || null)

  const [destAddr, setDestAddr] = useState(initialOrder?.destination_address || '')
  const [destLat, setDestLat] = useState<number | null>(initialOrder?.destination_lat || null)
  const [destLng, setDestLng] = useState<number | null>(initialOrder?.destination_lng || null)

  const [distanceKm, setDistanceKm] = useState<number>(initialOrder?.distance_km || 0)
  const [etaMins, setEtaMins] = useState<number>(initialOrder?.estimated_duration_min || 0)
  const [polyline, setPolyline] = useState<string | null>(initialOrder?.encoded_polyline || null)

  const [scheduledTime, setScheduledTime] = useState<string>(initialOrder?.scheduled_at ? new Date(initialOrder.scheduled_at).toISOString().slice(0, 16) : '')

  const [calculatedFare, setCalculatedFare] = useState<number>(initialOrder?.calculated_fare || 0)
  const [extraCharges, setExtraCharges] = useState<number>(initialOrder?.extra_charges || 0)
  const [finalFare, setFinalFare] = useState<number>(initialOrder?.final_fare || 0)

  const [notes, setNotes] = useState(initialOrder?.operator_notes || '')
  const [assignedDriverId, setAssignedDriverId] = useState<string | null>(initialOrder?.assigned_driver_id || null)
  const [recommendedDrivers, setRecommendedDrivers] = useState<any[]>([])

  const assignedDriver = 
    recommendedDrivers.find(d => d.id === assignedDriverId) ||
    allDrivers.find(d => d.id === assignedDriverId) || null

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)

  // Autocomplete UI state & debounce timers
  const [pickupResults, setPickupResults] = useState<any[]>([])
  const [destResults, setDestResults] = useState<any[]>([])
  const [isPickupOpen, setIsPickupOpen] = useState(false)
  const [isDestOpen, setIsDestOpen] = useState(false)
  const [isSearchingPickup, setIsSearchingPickup] = useState(false)
  const [isSearchingDest, setIsSearchingDest] = useState(false)
  const pickupSearchTimer = useRef<NodeJS.Timeout | null>(null)
  const destSearchTimer = useRef<NodeJS.Timeout | null>(null)
  const pickupRequestId = useRef(0)
  const destRequestId = useRef(0)

  useEffect(() => {
    return () => {
      if (pickupSearchTimer.current) clearTimeout(pickupSearchTimer.current)
      if (destSearchTimer.current) clearTimeout(destSearchTimer.current)
    }
  }, [])

  useEffect(() => {
    getActiveRulesAndMethods().then(({ rules, methods }) => {
      setRules(rules)
      setMethods(methods)
    })
  }, [])

  // Sync external driver selection (e.g. from clicking driver on map or fleet list)
  useEffect(() => {
    if (selectedDriverId) {
      setAssignedDriverId(selectedDriverId)
    }
  }, [selectedDriverId])

  // Sync external pickup click (e.g. from clicking on the map)
  useEffect(() => {
    if (externalPickup && externalPickup[0] && externalPickup[1]) {
      const [lat, lng] = externalPickup
      setPickupLat(lat)
      setPickupLng(lng)
      reverseGeocodeLocation(lat, lng).then(addr => {
        setPickupAddr(addr && addr !== 'Unknown Location' ? addr : `${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      })
    }
  }, [externalPickup])

  // Customer Lookup Debounce
  useEffect(() => {
    if (phone.length >= 6) {
      const timer = setTimeout(async () => {
        const cust = await lookupCustomer(phone)
        if (cust) {
          setCustomerData(cust)
          setCustomerId(cust.id)
          setName(cust.full_name)
        } else {
          setCustomerData(null)
          setCustomerId(null)
        }
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setCustomerData(null)
    }
  }, [phone])

  // Routing trigger
  useEffect(() => {
    if (pickupLat && pickupLng && destLat && destLng) {
      setIsCalculatingRoute(true)
      fetchRouteDetails(pickupLat, pickupLng, destLat, destLng).then(res => {
        setDistanceKm(res.distanceKm)
        setEtaMins(res.durationMinutes)
        setPolyline(res.polyline)
        setIsCalculatingRoute(false)

        // Run pricing calculator
        const activeRules = rules.length > 0 ? rules : [
          {
            id: 'fallback',
            vehicle_type: 'sedan',
            base_fare: 5.0,
            price_per_km: 1.5,
            minimum_fare: 7.0,
            night_multiplier: 1.0,
            night_start_hour: 22,
            night_end_hour: 6,
            extra_stop_fee: 0,
            waiting_fee_per_15min: 0,
            is_active: true
          }
        ] as any[];

        const fareRes = calculateFare(res.distanceKm, vehicleType, new Date(), extraCharges, activeRules)
        setCalculatedFare(fareRes.calculatedFare)
        setFinalFare(fareRes.finalFare)

        if (onRouteUpdate) {
          onRouteUpdate(
            pickupLat && pickupLng ? [pickupLat, pickupLng] : null,
            destLat && destLng ? [destLat, destLng] : null,
            res.polyline || null,
            res.distanceKm,
            res.durationMinutes
          )
        }
      }).catch(() => {
        setIsCalculatingRoute(false)
      })
    }
  }, [pickupLat, pickupLng, destLat, destLng, vehicleType, extraCharges, rules, onRouteUpdate])

  // Nearest driver trigger
  useEffect(() => {
    if (pickupLat && pickupLng) {
      fetchNearestDrivers(pickupLat, pickupLng, vehicleType).then(res => {
        setRecommendedDrivers(res)
        if (res.length > 0 && !assignedDriverId) {
          setAssignedDriverId(res[0].id) // Auto-select nearest
        }
      })
    }
  }, [pickupLat, pickupLng, vehicleType])

  const handlePickupChange = (val: string) => {
    setPickupAddr(val)
    if (pickupSearchTimer.current) clearTimeout(pickupSearchTimer.current)
    
    if (val.trim().length <= 2) {
      setPickupResults([])
      setIsPickupOpen(false)
      setIsSearchingPickup(false)
      return
    }

    setIsSearchingPickup(true)
    setIsPickupOpen(true)
    const currentId = ++pickupRequestId.current

    pickupSearchTimer.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(val.trim())
        if (currentId === pickupRequestId.current) {
          setPickupResults(res && res.length > 0 ? res : [{ name: val.trim(), lat: 33.89, lng: 35.50, source: 'fallback' }])
          setIsSearchingPickup(false)
        }
      } catch (err) {
        if (currentId === pickupRequestId.current) {
          setIsSearchingPickup(false)
        }
      }
    }, 250)
  }

  const handleDestChange = (val: string) => {
    setDestAddr(val)
    if (destSearchTimer.current) clearTimeout(destSearchTimer.current)
    
    if (val.trim().length <= 2) {
      setDestResults([])
      setIsDestOpen(false)
      setIsSearchingDest(false)
      return
    }

    setIsSearchingDest(true)
    setIsDestOpen(true)
    const currentId = ++destRequestId.current

    destSearchTimer.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(val.trim())
        if (currentId === destRequestId.current) {
          setDestResults(res && res.length > 0 ? res : [{ name: val.trim(), lat: 33.82, lng: 35.48, source: 'fallback' }])
          setIsSearchingDest(false)
        }
      } catch (err) {
        if (currentId === destRequestId.current) {
          setIsSearchingDest(false)
        }
      }
    }, 250)
  }

  const selectPickup = async (p: any) => {
    // Invalidate in-flight search requests immediately
    pickupRequestId.current++
    if (pickupSearchTimer.current) clearTimeout(pickupSearchTimer.current)

    setPickupAddr(p.name)
    setPickupResults([])
    setIsPickupOpen(false)
    setIsSearchingPickup(false)

    if (p.place_id && !p.lat) {
      const details = await getPlaceDetails(p.place_id)
      if (details) {
        setPickupLat(details.lat)
        setPickupLng(details.lng)
      }
    } else if (p.lat && p.lng) {
      setPickupLat(p.lat)
      setPickupLng(p.lng)
    }
  }

  const selectDest = async (p: any) => {
    // Invalidate in-flight search requests immediately
    destRequestId.current++
    if (destSearchTimer.current) clearTimeout(destSearchTimer.current)

    setDestAddr(p.name)
    setDestResults([])
    setIsDestOpen(false)
    setIsSearchingDest(false)

    if (p.place_id && !p.lat) {
      const details = await getPlaceDetails(p.place_id)
      if (details) {
        setDestLat(details.lat)
        setDestLng(details.lng)
      }
    } else if (p.lat && p.lng) {
      setDestLat(p.lat)
      setDestLng(p.lng)
    }
  }

  const applyDefaultPickup = () => {
    if (customerData?.default_pickup_address) {
      setPickupAddr(customerData.default_pickup_address)
    }
  }

  const handleSubmit = async (actionType: 'pending' | 'assign') => {
    setLoading(true)
    setError(null)
    try {
      if (!pickupLat || !destLat) {
        throw new Error("Must select valid coordinates from dropdown or map")
      }
      if (actionType === 'assign' && !assignedDriverId) {
        throw new Error("Must select a driver to dispatch.")
      }

      await submitOrder({
        id: initialOrder?.id,
        customer_id: customerId,
        customer_name: name,
        customer_phone: phone,
        order_source: initialOrder?.order_source || 'phone_call',
        vehicle_type: vehicleType,
        pickup_address: pickupAddr,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        destination_address: destAddr,
        destination_lat: destLat,
        destination_lng: destLng,
        distance_km: distanceKm,
        estimated_duration_min: etaMins,
        calculated_fare: calculatedFare,
        extra_charges: extraCharges,
        final_fare: finalFare,
        payment_method_code: paymentMethod,
        operator_notes: notes,
        scheduled_time: scheduledTime || new Date().toISOString(),
        encoded_polyline: polyline,
        assigned_driver_id: assignedDriverId
      }, actionType)

      if (onSaved) onSaved()
      else window.location.reload()

    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!initialOrder) return
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    
    setLoading(true)
    setError(null)
    try {
      await operatorCancelOrder(initialOrder.id, initialOrder.assigned_driver_id)
      
      if (onSaved) onSaved()
      else window.location.reload()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-6 max-h-screen overflow-y-auto w-full max-w-lg flex flex-col space-y-6">
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {initialOrder ? `Manage Order #${initialOrder.order_number}` : 'New Order'}
        </h2>
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Customer Section */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Phone Number</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none" placeholder="03 123 456" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Customer Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none" placeholder="John Doe" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Scheduled Date & Time (Optional)</label>
          <input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none" />
          <p className="text-[10px] text-gray-500 mt-1">Leave empty for "ASAP" immediate dispatch.</p>
        </div>

        {customerData && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Returning Customer
              </span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{customerData.total_trips} Lifetime Trips</span>
            </div>
            {customerData.notes && <p className="text-xs text-gray-700 dark:text-gray-300 italic mb-2">"{customerData.notes}"</p>}
            {customerData.default_pickup_address && (
              <button onClick={applyDefaultPickup} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded shadow-sm hover:bg-blue-700">
                Use Default Pickup: {customerData.default_pickup_address.substring(0, 15)}...
              </button>
            )}
          </div>
        )}
      </div>

      {/* Location Section */}
      <div className="space-y-4">
        {/* Pickup Location */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Pickup Location</label>
          <div className="relative">
            <input 
              type="text" 
              value={pickupAddr} 
              onChange={e => handlePickupChange(e.target.value)} 
              onFocus={() => { if (pickupResults.length > 0) setIsPickupOpen(true) }}
              onBlur={() => { setTimeout(() => setIsPickupOpen(false), 180) }}
              className="w-full pl-8 pr-8 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-green-500 focus:bg-white dark:focus:bg-gray-900 outline-none transition-colors" 
              placeholder="Search pickup address, street, or landmark..." 
            />
            <div className="absolute left-2.5 top-2.5 text-green-500 pointer-events-none">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            {isSearchingPickup && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          
          {isPickupOpen && pickupResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {pickupResults.map((r, i) => (
                <div 
                  key={i} 
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectPickup(r);
                  }}
                  className="px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer flex items-center gap-2.5 transition-colors group"
                >
                  <span className="text-gray-400 group-hover:text-blue-600 shrink-0">📍</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600">
                      {r.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Destination Location */}
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Destination Location</label>
          <div className="relative">
            <input 
              type="text" 
              value={destAddr} 
              onChange={e => handleDestChange(e.target.value)} 
              onFocus={() => { if (destResults.length > 0) setIsDestOpen(true) }}
              onBlur={() => { setTimeout(() => setIsDestOpen(false), 180) }}
              className="w-full pl-8 pr-8 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-red-500 focus:bg-white dark:focus:bg-gray-900 outline-none transition-colors" 
              placeholder="Search destination, city, or landmark..." 
            />
            <div className="absolute left-2.5 top-2.5 text-red-500 pointer-events-none">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            {isSearchingDest && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          
          {isDestOpen && destResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {destResults.map((r, i) => (
                <div 
                  key={i} 
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectDest(r);
                  }}
                  className="px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer flex items-center gap-2.5 transition-colors group"
                >
                  <span className="text-gray-400 group-hover:text-blue-600 shrink-0">📍</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600">
                      {r.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vehicle Type</label>
            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none">
              {Array.from(new Set(['sedan', 'suv', ...rules.map(r => r.vehicle_type)])).map(vt => (
                <option key={vt as string} value={vt as string}>{(vt as string).toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none">
              {methods.length > 0 ? (
                methods.map(m => <option key={m.code} value={m.code}>{m.display_name}</option>)
              ) : (
                <>
                  <option value="cash">Cash (Default)</option>
                  <option value="card">Credit Card</option>
                  <option value="whish">Whish Money</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Estimated Trip Duration & Distance Banner */}
        {isCalculatingRoute ? (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-3 flex items-center gap-2.5 animate-pulse">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Calculating driving route & trip duration...</span>
          </div>
        ) : etaMins > 0 ? (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                ⏱️
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                  Estimated Trip Duration (Passenger Ride)
                </div>
                <div className="text-lg font-black text-gray-900 dark:text-white">
                  {etaMins} mins <span className="text-xs font-medium text-gray-500">({distanceKm.toFixed(1)} km)</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Route Status</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Direct Route</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Pricing Module */}
      {distanceKm > 0 && (
        <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Trip Driving Time & Distance</span>
            <span className="font-bold text-gray-900 dark:text-white">{etaMins} mins • {distanceKm.toFixed(1)} km</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Auto-Calculated Fare</span>
            <span className="font-bold">${(calculatedFare || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Extra Charges (Stops/Wait)</span>
            <input type="number" step="0.1" value={Number.isNaN(extraCharges) ? '' : extraCharges} onChange={e => setExtraCharges(parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-700 text-right text-sm" />
          </div>
          <div className="flex justify-between items-center text-base pt-2 border-t border-gray-200 dark:border-gray-800">
            <span className="font-bold text-gray-900 dark:text-white">Final Customer Fare</span>
            <input type="number" step="0.1" value={Number.isNaN(finalFare) ? '' : finalFare} onChange={e => setFinalFare(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1 border border-green-500 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold text-right text-base" />
          </div>
        </div>
      )}

      {/* Driver Recommendation */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Driver Assignment</label>

        {/* Manual Driver Search */}
        <input
          type="text"
          placeholder="Search driver by ID or name..."
          className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none mb-2"
          onChange={(e) => {
            // Very simple manual override to just set the ID for testing
            setAssignedDriverId(e.target.value)
          }}
        />

        {recommendedDrivers.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recommendedDrivers.map(d => (
              <div
                key={d.id}
                onClick={() => {
                  setAssignedDriverId(d.id)
                  onDriverSelect?.(d.id)
                }}
                className={`p-2.5 rounded-lg border cursor-pointer flex justify-between items-center text-sm transition-all ${
                  assignedDriverId === d.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500 shadow-sm'
                    : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-white">{d.name}</span>
                    <span className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {d.vehicleType}
                    </span>
                    <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Available
                    </span>
                    {d.isExactMatch ? (
                      <span className="text-[9px] uppercase font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                        Exact Match
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                        Alt Class
                      </span>
                    )}
                    {d.phone && (
                      <WhatsAppButton
                        phone={d.phone}
                        driverName={d.name}
                        message={d.secure_access_token ? `Hello ${d.name}, your driver portal link is:\nhttps://taxi-erp.vercel.app/driver-portal/${d.secure_access_token}` : undefined}
                        variant="badge"
                        label="WhatsApp"
                      />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{d.category}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-blue-600 dark:text-blue-400">{d.etaMins} mins ETA</div>
                  <div className="text-xs text-gray-400">{d.distanceKm} km away</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic p-3 bg-gray-50 dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800">
            {pickupLat ? 'No drivers currently available nearby. Use the text box above to force assign.' : 'Select pickup location to see nearby drivers. Or click on the map.'}
          </div>
        )}

        {/* Quick WhatsApp contact for the currently assigned driver */}
        {assignedDriver && assignedDriver.phone && (
          <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl mt-2 transition-all shadow-sm">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate">
                  Assigned: {assignedDriver.name || assignedDriver.full_name}
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 truncate">
                  {assignedDriver.phone}
                </div>
              </div>
            </div>
            <WhatsAppButton
              phone={assignedDriver.phone}
              driverName={assignedDriver.name || assignedDriver.full_name}
              message={`Order #${initialOrder?.order_number || 'New Ride'}: Pickup at ${pickupAddr || 'Pickup point'}${destAddr ? ` to ${destAddr}` : ''}${assignedDriver.secure_access_token ? `\nDriver Portal:\nhttps://taxi-erp.vercel.app/driver-portal/${assignedDriver.secure_access_token}` : ''}`}
              variant="button"
              label="Chat on WhatsApp"
              className="shrink-0"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Operator Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950 dark:border-gray-700 text-sm focus:border-blue-500 outline-none" rows={2} placeholder="Dispatch instructions..."></textarea>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {!initialOrder || initialOrder.status === 'ai_draft' ? (
          <>
            <button onClick={() => handleSubmit('pending')} disabled={loading} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50">
              Save as Pending (Unassigned)
            </button>
            <button onClick={() => handleSubmit('assign')} disabled={loading || !assignedDriverId} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50">
              {loading ? 'Processing...' : 'Assign & Dispatch to Driver'}
            </button>
          </>
        ) : initialOrder.status === 'pending' ? (
          <button onClick={() => handleSubmit('assign')} disabled={loading || !assignedDriverId} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50">
            {loading ? 'Processing...' : 'Assign & Dispatch to Driver'}
          </button>
        ) : null}

        {/* Driver Simulation Buttons for Testing */}
        {initialOrder && ['assigned', 'accepted', 'on_the_way', 'arrived', 'picked_up'].includes(initialOrder.status) && (
          <div className="mt-4 p-4 border border-purple-200 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
            <h4 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase mb-2">Simulate Driver Phone App</h4>
            <p className="text-xs text-gray-600 mb-3">Normally, the driver updates these statuses from their mobile app. For testing, you can push the order forward here:</p>
            <div className="flex flex-wrap gap-2">
              {initialOrder.status === 'assigned' && <button onClick={async () => { await createClient().from('orders').update({ status: 'on_the_way' }).eq('id', initialOrder.id); if (onSaved) onSaved() }} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded">Driver: Start Trip</button>}
              {initialOrder.status === 'on_the_way' && <button onClick={async () => { await createClient().from('orders').update({ status: 'arrived' }).eq('id', initialOrder.id); if (onSaved) onSaved() }} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded">Driver: Arrived</button>}
              {initialOrder.status === 'arrived' && <button onClick={async () => { await createClient().from('orders').update({ status: 'picked_up' }).eq('id', initialOrder.id); if (onSaved) onSaved() }} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded">Driver: Passenger Boarded</button>}
              {initialOrder.status === 'picked_up' && <button onClick={async () => { await createClient().from('orders').update({ status: 'completed' }).eq('id', initialOrder.id); if (onSaved) onSaved() }} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded">Driver: Complete Trip</button>}
            </div>
          </div>
        )}

        {/* Clear Close Button */}
        {initialOrder && (
          <div className="flex gap-2 mt-2">
            <button onClick={handleCancel} disabled={loading} className="w-1/3 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-800/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => { if (onSaved) onSaved() }} className="w-2/3 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-bold transition-colors shadow-sm">
              Close Slider
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
