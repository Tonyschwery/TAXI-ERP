'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DriverPortalClient({ 
  driver, 
  token,
  totalTrips,
  totalEarnings,
  todayTrips
}: { 
  driver: any, 
  token: string,
  totalTrips: number,
  totalEarnings: number,
  todayTrips: any[]
}) {
  const supabase = createClient()
  
  const [activeTab, setActiveTab] = useState<'home' | 'trips'>('home')
  const [isAvailable, setIsAvailable] = useState(driver.availability === 'available')
  const [activeOrder, setActiveOrder] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  
  // Modals
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [finalFare, setFinalFare] = useState<number>(0)
  const [paymentCode, setPaymentCode] = useState<string>('cash')
  const [extraCharges, setExtraCharges] = useState<number>(0)

  // Wake Lock & GPS
  const [isWakeLockActive, setIsWakeLockActive] = useState(false)
  const wakeLockRef = useRef<any>(null)
  const lastGpsUpdateRef = useRef<number>(0)
  const lastCoordsRef = useRef<{lat: number, lng: number} | null>(null)

  // Distance calculator helper
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  useEffect(() => {
    // Fetch active order
    const fetchActiveOrder = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_driver_id', driver.id)
        .in('status', ['assigned', 'accepted', 'on_the_way', 'arrived', 'picked_up'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      setActiveOrder(data || null)
      if (data) {
         setFinalFare(data.calculated_fare || 0)
      }
    }

    const fetchPaymentMethods = async () => {
      const { data } = await supabase.from('payment_methods').select('*').eq('is_active', true)
      if (data) setPaymentMethods(data)
    }

    fetchActiveOrder()
    fetchPaymentMethods()

    // Realtime assignments
    const channel = supabase.channel(`driver_${driver.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `assigned_driver_id=eq.${driver.id}` }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
           const newOrder = payload.new
           if (['assigned', 'accepted', 'on_the_way', 'arrived', 'picked_up'].includes(newOrder.status)) {
             setActiveOrder(newOrder)
             setFinalFare(newOrder.calculated_fare || 0)
             if (payload.eventType === 'UPDATE' && newOrder.status === 'assigned') {
               triggerAlert()
             }
           } else if (newOrder.status === 'completed' || newOrder.status === 'cancelled') {
             setActiveOrder(null)
           }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driver.id, token, supabase])

  // Screen Wake Lock & GPS Engine
  useEffect(() => {
    let watchId: number

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
          setIsWakeLockActive(true)
          
          wakeLockRef.current.addEventListener('release', () => {
            setIsWakeLockActive(false)
          })
        } catch (err: any) {
          console.error(`${err.name}, ${err.message}`)
        }
      }
    }

    const releaseWakeLock = () => {
      if (wakeLockRef.current !== null) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null
        })
      }
    }

    const shouldBeActive = isAvailable || activeOrder !== null

    if (shouldBeActive) {
      // 1. Request Wake Lock
      requestWakeLock()

      // 2. Start precise GPS tracking
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const now = Date.now()
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            const lastCoords = lastCoordsRef.current
            
            // Throttle: Update if 15 seconds passed OR moved more than 30 meters
            let shouldUpdate = false
            if (now - lastGpsUpdateRef.current > 15000) {
              shouldUpdate = true
            } else if (lastCoords) {
              const distanceMoved = getDistance(lastCoords.lat, lastCoords.lng, lat, lng)
              if (distanceMoved > 30) {
                shouldUpdate = true
              }
            } else {
              shouldUpdate = true
            }

            if (shouldUpdate) {
              lastGpsUpdateRef.current = now
              lastCoordsRef.current = { lat, lng }
              
              fetch('/api/driver-portal/gps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, lat, lng })
              }).catch(() => {})
            }
          },
          (err) => console.error(err),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        )
      }

      // Re-request wake lock if visibility changes (browser security feature)
      const handleVisibilityChange = () => {
        if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
          requestWakeLock()
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        if (watchId) navigator.geolocation.clearWatch(watchId)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        releaseWakeLock()
      }
    } else {
      releaseWakeLock()
    }
  }, [isAvailable, activeOrder, token])

  const triggerAlert = () => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500])
  }

  const handleToggle = async () => {
    const newAvail = isAvailable ? 'offline' : 'available'
    setIsAvailable(!isAvailable)
    await fetch('/api/driver-portal/action', {
      method: 'POST',
      body: JSON.stringify({ token, action: 'toggle_availability', data: { availability: newAvail } })
    })
  }

  const handleStatusUpdate = async (status: string) => {
    if (!activeOrder) return
    setActiveOrder({ ...activeOrder, status }) // Optimistic
    await fetch('/api/driver-portal/action', {
      method: 'POST',
      body: JSON.stringify({ token, action: 'update_order_status', data: { orderId: activeOrder.id, status } })
    })
  }

  const handleCancel = async () => {
    if (!activeOrder || !cancelReason) return
    await fetch('/api/driver-portal/action', {
      method: 'POST',
      body: JSON.stringify({ token, action: 'update_order_status', data: { orderId: activeOrder.id, status: 'cancelled', cancel_reason: cancelReason } })
    })
    setShowCancelModal(false)
    setActiveOrder(null)
  }

  const handleComplete = async () => {
    if (!activeOrder) return
    await fetch('/api/driver-portal/action', {
      method: 'POST',
      body: JSON.stringify({ 
        token, 
        action: 'update_order_status', 
        data: { 
          orderId: activeOrder.id, 
          status: 'completed',
          final_fare: finalFare + extraCharges,
          payment_method_code: paymentCode,
          extra_charges: extraCharges
        } 
      })
    })
    setShowCompleteModal(false)
    setActiveOrder(null)
    // Reload page to update todayTrips server-side prop
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-black font-sans pb-24 flex flex-col">
      
      {/* Top Bar */}
      <div className="bg-white dark:bg-gray-900 px-4 py-3 shadow-md rounded-b-3xl flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="font-black text-xl text-gray-900 dark:text-white leading-tight">{driver.full_name}</h1>
          <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">{driver.driver_categories?.name || 'Driver'}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">Today</div>
          <div className="font-black text-gray-900 dark:text-white">{totalTrips} Trips • ${totalEarnings.toFixed(2)}</div>
        </div>
      </div>

      <div className="px-4 mt-6 flex-1">
        
        {activeTab === 'home' && (
          <>
            {/* Availability Toggle */}
            <button 
              onClick={handleToggle}
              className={`w-full py-4 rounded-2xl font-black text-lg transition-transform active:scale-95 shadow-lg border-2 ${isAvailable ? 'bg-green-500 border-green-600 text-white' : 'bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-500'}`}
            >
              {isAvailable ? '✅ ONLINE & AVAILABLE' : '❌ OFFLINE'}
            </button>

            {/* Wake Lock Indicator */}
            {(isAvailable || activeOrder) && (
              <div className="mt-3 flex justify-center items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isWakeLockActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">
                  {isWakeLockActive ? 'Screen Awake & GPS Active' : 'Screen Lock Disabled'}
                </span>
              </div>
            )}

            {!isAvailable && !activeOrder && (
              <div className="mt-8 text-center text-gray-500 font-bold">
                You are offline. Go online to receive orders.
              </div>
            )}

            {isAvailable && !activeOrder && (
              <div className="mt-12 text-center text-gray-400 font-bold animate-pulse">
                Searching for nearby trips...
              </div>
            )}

            {/* Active Order Card */}
            {activeOrder && (
              <div className="mt-6 bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-2xl border-t-4 border-blue-500">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-xs uppercase font-black text-blue-500 tracking-widest">Active Order</div>
                    <div className="text-2xl font-black text-gray-900 dark:text-white">#{activeOrder.order_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase font-black text-gray-500 tracking-widest">Fare</div>
                    <div className="text-2xl font-black text-green-500">${activeOrder.calculated_fare?.toFixed(2)}</div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl mb-4">
                  <div className="font-bold text-gray-900 dark:text-white text-lg">{activeOrder.customer_name}</div>
                  <a href={`tel:${activeOrder.customer_phone}`} className="mt-2 block text-center bg-blue-600 text-white font-bold py-2 rounded-xl active:bg-blue-700">
                    📞 CALL {activeOrder.customer_phone}
                  </a>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-3">
                    <div className="mt-1 w-3 h-3 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pickup</div>
                      <div className="font-bold text-gray-900 dark:text-white text-base leading-tight">{activeOrder.pickup_address}</div>
                      <div className="flex gap-2 mt-2">
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeOrder.pickup_lat},${activeOrder.pickup_lng}`} target="_blank" className="text-xs bg-gray-100 dark:bg-gray-800 font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">📍 Google Maps</a>
                        <a href={`https://waze.com/ul?ll=${activeOrder.pickup_lat},${activeOrder.pickup_lng}&navigate=yes`} target="_blank" className="text-xs bg-gray-100 dark:bg-gray-800 font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">🚗 Waze</a>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="mt-1 w-3 h-3 rounded-full bg-red-500 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dropoff</div>
                      <div className="font-bold text-gray-900 dark:text-white text-base leading-tight">{activeOrder.destination_address}</div>
                      {activeOrder.status === 'picked_up' && (
                         <div className="flex gap-2 mt-2">
                         <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeOrder.destination_lat},${activeOrder.destination_lng}`} target="_blank" className="text-xs bg-gray-100 dark:bg-gray-800 font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">📍 Google Maps</a>
                       </div>
                      )}
                    </div>
                  </div>
                </div>

                {activeOrder.operator_notes && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-xl mb-6 text-sm text-yellow-800 dark:text-yellow-200 font-semibold border border-yellow-200 dark:border-yellow-800">
                    📝 Note: {activeOrder.operator_notes}
                  </div>
                )}

                {/* Sequential Action Buttons */}
                <div className="space-y-3">
                  {activeOrder.status === 'assigned' && (
                    <button onClick={() => handleStatusUpdate('accepted')} className="w-full bg-green-500 text-white font-black text-xl py-5 rounded-2xl shadow-[0_8px_0_#166534] active:shadow-none active:translate-y-2 transition-all">
                      ACCEPT TRIP
                    </button>
                  )}
                  {activeOrder.status === 'accepted' && (
                    <button onClick={() => handleStatusUpdate('on_the_way')} className="w-full bg-blue-500 text-white font-black text-xl py-5 rounded-2xl shadow-[0_8px_0_#1e3a8a] active:shadow-none active:translate-y-2 transition-all">
                      ON THE WAY
                    </button>
                  )}
                  {activeOrder.status === 'on_the_way' && (
                    <button onClick={() => handleStatusUpdate('arrived')} className="w-full bg-indigo-500 text-white font-black text-xl py-5 rounded-2xl shadow-[0_8px_0_#312e81] active:shadow-none active:translate-y-2 transition-all">
                      ARRIVED AT PICKUP
                    </button>
                  )}
                  {activeOrder.status === 'arrived' && (
                    <button onClick={() => handleStatusUpdate('picked_up')} className="w-full bg-orange-500 text-white font-black text-xl py-5 rounded-2xl shadow-[0_8px_0_#7c2d12] active:shadow-none active:translate-y-2 transition-all">
                      CUSTOMER PICKED UP
                    </button>
                  )}
                  {activeOrder.status === 'picked_up' && (
                    <button onClick={() => setShowCompleteModal(true)} className="w-full bg-emerald-500 text-white font-black text-2xl py-6 rounded-2xl shadow-[0_8px_0_#064e3b] active:shadow-none active:translate-y-2 transition-all animate-bounce">
                      COMPLETE TRIP
                    </button>
                  )}
                  
                  <button onClick={() => setShowCancelModal(true)} className="w-full text-red-500 font-bold py-3 text-sm tracking-widest mt-2 uppercase">
                    Cancel Trip
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'trips' && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm min-h-[400px]">
            <h2 className="font-black text-xl text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">My Trips Today</h2>
            {todayTrips.length === 0 ? (
              <div className="text-center text-gray-500 font-bold mt-10">No trips completed today yet.</div>
            ) : (
              <div className="space-y-4">
                {todayTrips.map(trip => (
                  <div key={trip.id} className="p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">#{trip.order_number}</div>
                      <div className="text-[10px] text-gray-500 truncate max-w-[150px]">{trip.pickup_address}</div>
                      <div className="text-[10px] uppercase font-bold mt-1 text-gray-400">{new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="text-right">
                      {trip.status === 'completed' ? (
                        <>
                          <div className="font-black text-green-600">${trip.final_fare?.toFixed(2)}</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase bg-gray-200 dark:bg-gray-800 px-1 rounded inline-block">{trip.payment_method_code}</div>
                        </>
                      ) : (
                        <div className="font-bold text-red-500 text-sm uppercase">Cancelled</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center p-3 z-20 pb-safe">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center p-2 transition-colors ${activeTab === 'home' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('trips')}
          className={`flex flex-col items-center p-2 transition-colors ${activeTab === 'trips' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">My Trips</span>
        </button>
      </div>

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 flex flex-col p-6 animate-slide-in-right overflow-y-auto">
          <h2 className="font-black text-3xl mb-8">Trip Complete</h2>
          
          <div className="space-y-6 flex-1">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Base Fare</label>
              <input type="number" value={finalFare} onChange={e => setFinalFare(parseFloat(e.target.value) || 0)} className="w-full text-4xl font-black bg-transparent border-b-4 border-gray-200 dark:border-gray-800 focus:border-green-500 outline-none pb-2" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Extra Stops / Wait Time</label>
              <input type="number" value={extraCharges} onChange={e => setExtraCharges(parseFloat(e.target.value) || 0)} className="w-full text-2xl font-black bg-transparent border-b-4 border-gray-200 dark:border-gray-800 focus:border-green-500 outline-none pb-2" />
            </div>

            <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-2xl border border-green-200 dark:border-green-800">
              <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-widest">Total to Collect</div>
              <div className="text-4xl font-black text-green-600">${(finalFare + extraCharges).toFixed(2)}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                {paymentMethods.map(m => (
                  <button 
                    key={m.code} 
                    onClick={() => setPaymentCode(m.code)}
                    className={`py-4 rounded-xl font-bold text-lg transition-colors border-2 ${paymentCode === m.code ? 'bg-blue-600 border-blue-600 text-white' : 'bg-transparent border-gray-300 dark:border-gray-700 text-gray-500'}`}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button onClick={() => setShowCompleteModal(false)} className="flex-1 py-4 font-bold bg-gray-200 dark:bg-gray-800 rounded-2xl">BACK</button>
            <button onClick={handleComplete} className="flex-[2] py-4 font-black text-xl text-white bg-green-500 rounded-2xl shadow-[0_6px_0_#166534] active:shadow-none active:translate-y-1">CONFIRM DONE</button>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm">
            <h3 className="font-black text-2xl text-red-500 mb-4">Cancel Trip?</h3>
            <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full p-4 bg-gray-100 dark:bg-black rounded-xl mb-6 outline-none font-bold">
              <option value="">Select a reason...</option>
              <option value="Customer No Show">Customer No Show</option>
              <option value="Car Problem">Car Problem</option>
              <option value="Too Far">Too Far</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 font-bold py-3 bg-gray-200 dark:bg-gray-800 rounded-xl">Back</button>
              <button onClick={handleCancel} disabled={!cancelReason} className="flex-1 font-bold py-3 bg-red-500 text-white rounded-xl disabled:opacity-50">Cancel Trip</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
