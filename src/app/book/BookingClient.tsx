'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Simple mock since we are using string inputs without geocoding yet
const calculateRoute = async (pickup: string, dropoff: string) => {
  return new Promise<{ distanceKm: number, durationMins: number }>((resolve) => {
    setTimeout(() => {
      // Dummy logic based on string lengths to make it deterministic but variable
      const dist = (pickup.length + dropoff.length) * 0.3
      const duration = dist * 2
      resolve({ distanceKm: dist, durationMins: duration })
    }, 500)
  })
}

export default function BookingClient({ pricingTiers }: { pricingTiers: any[] }) {
  const supabase = createClient()
  
  const [form, setForm] = useState({
    name: '',
    phone: '',
    pickup: '',
    destination: '',
    time: 'now', // 'now' or 'scheduled'
    scheduledAt: '',
    vehicleType: 'sedan',
    paymentMethod: 'cash',
    notes: ''
  })
  
  const [routeInfo, setRouteInfo] = useState<{ distKm: number, durationMin: number, fare: number } | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Auto-estimate when addresses change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (form.pickup.length > 4 && form.destination.length > 4) {
        handleEstimate()
      }
    }, 1500) // 1.5s debounce

    return () => clearTimeout(delayDebounceFn)
  }, [form.pickup, form.destination, form.vehicleType, form.time])

  const handleEstimate = async () => {
    setIsEstimating(true)
    try {
      const res = await calculateRoute(form.pickup, form.destination)
      if (res && res.distanceKm > 0) {
        
        // Find matching tier
        let isNight = false
        if (form.time === 'now') {
          const h = new Date().getHours()
          isNight = h >= 22 || h < 6
        } else if (form.scheduledAt) {
          const h = new Date(form.scheduledAt).getHours()
          isNight = h >= 22 || h < 6
        }

        let applicableTier = pricingTiers.find(t => 
          t.vehicle_type === form.vehicleType &&
          t.is_night_rate === isNight
        )

        // Fallback to first available
        if (!applicableTier) applicableTier = pricingTiers[0]

        let fare = 0
        if (applicableTier) {
          fare = applicableTier.base_fare + (res.distanceKm * applicableTier.per_km_rate) + (res.durationMins * applicableTier.per_minute_rate)
          if (fare < applicableTier.minimum_fare) fare = applicableTier.minimum_fare
        }

        setRouteInfo({ distKm: res.distanceKm, durationMin: res.durationMins, fare })
      }
    } catch (e) {
      console.error(e)
    }
    setIsEstimating(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Lookup or create customer
    let cId = null
    const { data: existingCustomer } = await supabase.from('customers').select('id').eq('phone_number', form.phone).maybeSingle()
    if (existingCustomer) {
      cId = existingCustomer.id
    } else {
      const { data: newC } = await supabase.from('customers').insert([{
        full_name: form.name,
        phone_number: form.phone,
        status: 'active'
      }]).select().single()
      if (newC) cId = newC.id
    }

    // Insert Order
    const { error } = await supabase.from('orders').insert([{
      source: 'web_app',
      status: 'pending', // Triggers dispatcher
      customer_id: cId,
      customer_name: form.name,
      customer_phone: form.phone,
      pickup_address: form.pickup,
      destination_address: form.destination,
      scheduled_at: form.time === 'now' ? new Date().toISOString() : new Date(form.scheduledAt).toISOString(),
      vehicle_type_requested: form.vehicleType,
      payment_method_code: form.paymentMethod,
      notes: form.notes,
      distance_km: routeInfo?.distKm || 0,
      estimated_duration_min: routeInfo?.durationMin || 0,
      calculated_fare: routeInfo?.fare || 0,
      final_fare: routeInfo?.fare || 0 // Assuming final is calculated for web users
    }])

    setIsSubmitting(false)
    if (!error) {
      setSuccess(true)
    } else {
      alert('Error creating booking. Please try again.')
    }
  }

  if (success) {
    return (
      <div className="text-center py-10 animate-fade-in">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-3xl font-black mb-2">Booking Confirmed!</h2>
        <p className="text-gray-500 mb-8">We have received your request. A driver will be assigned shortly.</p>
        <button onClick={() => window.location.reload()} className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 px-8 rounded-full shadow-lg transition-transform active:scale-95">
          Book Another Ride
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Full Name *</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black font-semibold" required placeholder="John Doe" />
        </div>
        <div>
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Phone Number *</label>
          <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black font-semibold" required placeholder="+961 03 123 456" />
        </div>
      </div>

      <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border dark:border-gray-800 relative">
        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-300 dark:bg-gray-700 z-0"></div>
        <div className="relative z-10">
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Pickup Location *</label>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0 border-4 border-white dark:border-gray-900 shadow"></div>
            <input type="text" value={form.pickup} onChange={e => setForm({ ...form, pickup: e.target.value })} className="w-full border p-3 rounded-lg bg-white dark:bg-black font-semibold shadow-sm" required placeholder="e.g. ABC Mall Achrafieh" />
          </div>
        </div>
        <div className="relative z-10">
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs mt-2">Destination *</label>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0 border-4 border-white dark:border-gray-900 shadow"></div>
            <input type="text" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="w-full border p-3 rounded-lg bg-white dark:bg-black font-semibold shadow-sm" required placeholder="e.g. Beirut Airport" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">When?</label>
          <div className="flex rounded-lg overflow-hidden border dark:border-gray-800 bg-gray-50 dark:bg-black">
            <button type="button" onClick={() => setForm({...form, time: 'now'})} className={`flex-1 py-3 font-bold transition-colors ${form.time === 'now' ? 'bg-yellow-400 text-black' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Now</button>
            <button type="button" onClick={() => setForm({...form, time: 'scheduled'})} className={`flex-1 py-3 font-bold transition-colors ${form.time === 'scheduled' ? 'bg-yellow-400 text-black' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Later</button>
          </div>
        </div>
        {form.time === 'scheduled' && (
          <div className="col-span-2">
            <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Date & Time *</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black font-semibold" required />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Vehicle Type</label>
          <select value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black font-semibold">
            <option value="sedan">Standard Sedan</option>
            <option value="suv">SUV (Up to 6 passengers)</option>
            <option value="van">Van (Group transport)</option>
            <option value="vip">VIP / Luxury</option>
          </select>
        </div>
        <div>
          <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Payment Method</label>
          <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black font-semibold">
            <option value="cash">Cash (Pay in Car)</option>
            <option value="credit">Credit Card (Pay in Car)</option>
            <option value="whish">Whish Money</option>
          </select>
        </div>
      </div>
      
      <div>
        <label className="block text-gray-500 font-bold mb-1 uppercase text-xs">Notes for Driver</label>
        <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border p-3 rounded-lg bg-gray-50 dark:bg-black" placeholder="e.g. Wait near the pharmacy" />
      </div>

      {/* Fare Estimate Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Estimated Fare</div>
          {isEstimating ? (
            <div className="text-sm font-semibold text-gray-500 mt-1 animate-pulse">Calculating route...</div>
          ) : routeInfo ? (
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-1">
              {routeInfo.distKm.toFixed(1)} km &bull; ~{routeInfo.durationMin} mins driving
            </div>
          ) : (
            <div className="text-sm font-semibold text-gray-500 mt-1">Enter pickup and destination</div>
          )}
        </div>
        <div className="text-3xl font-black text-blue-700 dark:text-blue-500">
          ${routeInfo?.fare.toFixed(2) || '0.00'}
        </div>
      </div>

      <button disabled={isSubmitting} type="submit" className="w-full bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 text-white font-black text-lg py-4 rounded-xl shadow-xl transition-transform active:scale-95 disabled:opacity-50">
        {isSubmitting ? 'Processing...' : 'Confirm Booking'}
      </button>

    </form>
  )
}
