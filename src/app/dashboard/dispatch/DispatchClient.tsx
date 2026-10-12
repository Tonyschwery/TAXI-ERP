'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import OrderEntryForm from '@/components/dispatch/OrderEntryForm'

import { reverseGeocodeLocation } from '@/components/dispatch/actions'

// Dynamically import map to avoid SSR window is not defined errors
const LiveDispatchMap = dynamic(() => import('@/components/maps/LiveDispatchMap'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 dark:bg-gray-900 rounded-xl animate-pulse flex items-center justify-center">Loading Map...</div>
})

function DriverReadinessCard({ driver, onClick }: { driver: any, onClick: () => void }) {
  const [address, setAddress] = useState<string>('Locating...')
  
  useEffect(() => {
    if (driver.current_lat && driver.current_lng) {
      reverseGeocodeLocation(driver.current_lat, driver.current_lng).then(setAddress)
    } else {
      setAddress('No GPS Signal')
    }
  }, [driver.current_lat, driver.current_lng])

  const lastPingFormatted = driver.last_gps_update 
    ? new Date(driver.last_gps_update).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div 
      onClick={onClick}
      className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl flex justify-between items-center cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
    >
      <div>
        <div className="flex items-center gap-2">
          <div className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 transition-colors">{driver.driver_code}</div>
          <div className="text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">{driver.full_name}</div>
        </div>
        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="truncate max-w-[130px]" title={address}>{address}</span>
        </div>
        {lastPingFormatted && (
          <div className="text-[9px] text-gray-400 font-mono mt-0.5 flex items-center gap-1">
            <span>📡</span> {lastPingFormatted}
          </div>
        )}
      </div>
      <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse shrink-0"></div>
    </div>
  )
}

export default function DispatchClient({ initialOrders = [], initialDrivers = [] }: { initialOrders: any[], initialDrivers: any[] }) {
  const [orders, setOrders] = useState<any[]>(initialOrders)
  const [drivers, setDrivers] = useState<any[]>(initialDrivers)
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'drafts' | 'pending' | 'active' | 'completed'>('pending')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false)

  // Map state
  const [mapPickup, setMapPickup] = useState<[number, number] | null>(null)
  const [mapDest, setMapDest] = useState<[number, number] | null>(null)
  const [mapRoute, setMapRoute] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // 1. Subscribe to Orders
    const ordersChannel = supabase.channel('realtime:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch(e) {}

        if (payload.eventType === 'INSERT') {
          setOrders(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      })
      .subscribe()

    // 2. Subscribe to Drivers
    const driversChannel = supabase.channel('realtime:drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setDrivers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new, driver_categories: d.driver_categories } : d))
        } else if (payload.eventType === 'INSERT') {
          setDrivers(prev => [...prev, payload.new])
        }
      })
      .subscribe()

    // 3. Heartbeat polling fallback (ensures latest driver GPS positions every 10s)
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('drivers')
        .select('*, driver_categories(name)')
        .eq('is_active', true)
      if (data && data.length > 0) {
        setDrivers(data)
      }
    }, 10000)

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(driversChannel)
      clearInterval(pollInterval)
    }
  }, [])

  // KPIs
  const drafts = orders.filter(o => o.status === 'ai_draft')
  const pending = orders.filter(o => o.status === 'pending')
  const activeStatuses = ['assigned', 'accepted', 'on_the_way', 'arrived', 'picked_up']
  const activeTrips = orders.filter(o => activeStatuses.includes(o.status))
  
  const todayStart = new Date()
  todayStart.setHours(0,0,0,0)
  const completedToday = orders.filter(o => o.status === 'completed' && new Date(o.created_at) > todayStart)
  const cancelledToday = orders.filter(o => o.status === 'cancelled' && new Date(o.created_at) > todayStart)

  const availableDrivers = drivers.filter(d => d.availability === 'available')
  const busyDrivers = drivers.filter(d => d.availability === 'busy')

  const [focusedMapLocation, setFocusedMapLocation] = useState<[number, number] | null>(null)

  // Map markers mapping
  const driverMarkers = useMemo(() => {
    return drivers.filter(d => d.current_lat && d.current_lng).map(d => ({
      id: d.id,
      driver_code: d.driver_code,
      full_name: d.full_name,
      categoryName: d.driver_categories?.name || 'Driver',
      availability: d.availability as any,
      lat: d.current_lat,
      lng: d.current_lng
    }))
  }, [drivers])

  const openOrder = (order: any) => {
    setSelectedOrder(order)
    setIsOrderFormOpen(true)
    if (order.pickup_lat) setMapPickup([order.pickup_lat, order.pickup_lng])
    if (order.destination_lat) setMapDest([order.destination_lat, order.destination_lng])
    if (order.encoded_polyline) setMapRoute(order.encoded_polyline)
    setFocusedMapLocation(null)
  }

  const handleNewOrder = () => {
    setSelectedOrder(null)
    setIsOrderFormOpen(true)
    setMapPickup(null)
    setMapDest(null)
    setMapRoute(null)
    setFocusedMapLocation(null)
  }

  const handleDriverCardClick = (d: any) => {
    if (d.current_lat && d.current_lng) {
      setFocusedMapLocation([d.current_lat, d.current_lng])
    }
  }

  const renderOrderCard = (order: any) => (
    <div key={order.id} onClick={() => openOrder(order)} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-gray-900 dark:text-white">#{order.order_number}</span>
          <span className={`ml-2 text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            order.status === 'ai_draft' ? 'bg-purple-100 text-purple-700' :
            order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            order.status === 'completed' ? 'bg-green-100 text-green-700' :
            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>{order.status.replace('_', ' ')}</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{order.customer_name || order.customer_phone}</div>
      
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div> {order.pickup_address}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div> {order.destination_address || 'As Directed'}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs">
        <span className="font-semibold text-gray-700 dark:text-gray-300 uppercase">{order.vehicle_type}</span>
        <span className="font-bold text-green-600 dark:text-green-400">${order.final_fare?.toFixed(2) || '0.00'}</span>
      </div>
    </div>
  )

  const activeOrdersList = activeTab === 'drafts' ? drafts 
                         : activeTab === 'pending' ? pending 
                         : activeTab === 'active' ? activeTrips 
                         : [...completedToday, ...cancelledToday]

  return (
    <div className="h-full flex flex-col space-y-4 relative">
      
      {/* Top KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-xl border border-purple-200 dark:border-purple-800/50">
          <div className="text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wide">AI Drafts</div>
          <div className="text-2xl font-black text-purple-700 dark:text-purple-300">{drafts.length}</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800/50">
          <div className="text-yellow-600 dark:text-yellow-400 text-xs font-bold uppercase tracking-wide">Pending</div>
          <div className="text-2xl font-black text-yellow-700 dark:text-yellow-300">{pending.length}</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-200 dark:border-blue-800/50">
          <div className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wide">Active Trips</div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-300">{activeTrips.length}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800/50">
          <div className="text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wide">Completed</div>
          <div className="text-2xl font-black text-green-700 dark:text-green-300">{completedToday.length}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800/50">
          <div className="text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wide">Cancelled</div>
          <div className="text-2xl font-black text-red-700 dark:text-red-300">{cancelledToday.length}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
          <div className="text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wide">Drivers Available</div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{availableDrivers.length}</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl border border-orange-200 dark:border-orange-800/50">
          <div className="text-orange-600 dark:text-orange-400 text-xs font-bold uppercase tracking-wide">Drivers Busy</div>
          <div className="text-2xl font-black text-orange-700 dark:text-orange-300">{busyDrivers.length}</div>
        </div>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        
        {/* Left Column: Kanban / List */}
        <div className="w-1/3 flex flex-col bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 text-sm font-medium">
            <button onClick={() => setActiveTab('drafts')} className={`flex-1 py-3 text-center transition-colors ${activeTab === 'drafts' ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Drafts ({drafts.length})</button>
            <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 text-center transition-colors ${activeTab === 'pending' ? 'border-b-2 border-yellow-500 text-yellow-600 dark:text-yellow-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Pending ({pending.length})</button>
            <button onClick={() => setActiveTab('active')} className={`flex-1 py-3 text-center transition-colors ${activeTab === 'active' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Active ({activeTrips.length})</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <button onClick={handleNewOrder} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-sm transition-colors mb-2">
              + Create New Order
            </button>
            {activeOrdersList.map(renderOrderCard)}
            {activeOrdersList.length === 0 && (
              <div className="text-center text-gray-500 italic mt-10">No orders in this queue.</div>
            )}
          </div>
        </div>

        {/* Right Column: Map & Available Drivers */}
        <div className="w-2/3 flex flex-col gap-4">
          <div className="flex-1">
            <LiveDispatchMap 
              drivers={driverMarkers}
              pickup={mapPickup}
              destination={mapDest}
              encodedPolyline={mapRoute}
              focusedLocation={focusedMapLocation}
              onDriverClick={(id) => {
                if (isOrderFormOpen) {
                  alert("Click driver inside the Order Entry Form to assign.")
                } else {
                  // Pan to driver
                  const d = drivers.find(drv => drv.id === id)
                  if (d?.current_lat && d?.current_lng) {
                    setFocusedMapLocation([d.current_lat, d.current_lng])
                  }
                }
              }}
            />
          </div>
          
          {/* Compact Driver Readiness List */}
          <div className="h-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col shadow-sm">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3 text-sm flex justify-between items-center">
              Available Fleet Readiness
              <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{availableDrivers.length} Online</span>
            </h3>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
              {availableDrivers.map(d => (
                <DriverReadinessCard key={d.id} driver={d} onClick={() => handleDriverCardClick(d)} />
              ))}
              {availableDrivers.length === 0 && <div className="text-sm text-gray-500 italic flex items-center col-span-full justify-center mt-6">All drivers are busy or offline.</div>}
            </div>
          </div>

        </div>
      </div>

      {/* Slide-over Drawer for Order Entry */}
      {isOrderFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="w-full max-w-lg h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col transform transition-transform duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h2 className="font-bold text-gray-900 dark:text-white">Order Entry</h2>
              <button onClick={() => setIsOrderFormOpen(false)} className="text-xl font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <OrderEntryForm 
                initialOrder={selectedOrder} 
                onSaved={() => {
                  setIsOrderFormOpen(false)
                  // Realtime will update the list automatically!
                }} 
                onRouteUpdate={(pickup, dest, route) => {
                  setMapPickup(pickup)
                  setMapDest(dest)
                  setMapRoute(route)
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
