'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchPlaces, getPlaceDetails } from '@/components/dispatch/actions'
import { submitBookingForm } from './actions'

export default function CustomerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const sessionId = unwrappedParams.id
  
  const [session, setSession] = useState<any>(null)
  const [pickup, setPickup] = useState('')
  const [pickupLat, setPickupLat] = useState<number|null>(null)
  const [pickupLng, setPickupLng] = useState<number|null>(null)
  const [pickupResults, setPickupResults] = useState<any[]>([])
  
  const [destination, setDestination] = useState('')
  const [destLat, setDestLat] = useState<number|null>(null)
  const [destLng, setDestLng] = useState<number|null>(null)
  const [destResults, setDestResults] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      
      if (data) {
        setSession(data)
        setPickup(data.extracted_pickup || '')
        setDestination(data.extracted_destination || '')
      }
      setLoading(false)
    }
    loadSession()
  }, [sessionId, supabase])

  const handlePickupChange = async (val: string) => {
    setPickup(val)
    if (val.length > 2) {
      const res = await searchPlaces(val)
      setPickupResults(res || [])
    } else {
      setPickupResults([])
    }
  }

  const selectPickup = async (place: any) => {
    setPickup(place.name || place.description)
    setPickupResults([])
    if (place.source === 'local') {
      setPickupLat(place.lat)
      setPickupLng(place.lng)
    } else if (place.place_id) {
      const coords = await getPlaceDetails(place.place_id)
      if (coords) {
        setPickupLat(coords.lat)
        setPickupLng(coords.lng)
      }
    }
  }

  const handleDestChange = async (val: string) => {
    setDestination(val)
    if (val.length > 2) {
      const res = await searchPlaces(val)
      setDestResults(res || [])
    } else {
      setDestResults([])
    }
  }

  const selectDest = async (place: any) => {
    setDestination(place.name || place.description)
    setDestResults([])
    if (place.source === 'local') {
      setDestLat(place.lat)
      setDestLng(place.lng)
    } else if (place.place_id) {
      const coords = await getPlaceDetails(place.place_id)
      if (coords) {
        setDestLat(coords.lat)
        setDestLng(coords.lng)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pickupLat || !destLat) return
    
    setSaving(true)

    try {
      await submitBookingForm(sessionId, pickup, pickupLat, pickupLng!, destination, destLat, destLng!)
      setSubmitted(true)
    } catch (err) {
      alert('Failed to submit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div></div>
  if (!session) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-500 font-bold">Session not found or expired.</div>

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-2">Request Sent!</h2>
          <p className="text-gray-500">Our operator has received your exact locations. We will reply on WhatsApp momentarily with your driver details and final price.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform rotate-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900">Complete Your Booking</h1>
          <p className="text-gray-500 mt-2 font-medium">Please confirm your exact locations so we can dispatch your car.</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Pickup Location</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                </div>
                <input 
                  type="text" 
                  required
                  value={pickup || ''}
                  onChange={e => handlePickupChange(e.target.value)}
                  onFocus={() => { if (pickup && pickup.length > 2) handlePickupChange(pickup) }}
                  placeholder="e.g. ABC Mall Achrafieh, Gate 2"
                  className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-medium text-gray-900"
                />
                {pickupResults.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {pickupResults.map((p, i) => (
                      <li key={p.place_id || i} onMouseDown={() => selectPickup(p)} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 text-sm font-medium text-gray-800">
                        {p.name || p.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="relative">
              <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Drop-off Location</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                </div>
                <input 
                  type="text" 
                  required
                  value={destination || ''}
                  onChange={e => handleDestChange(e.target.value)}
                  onFocus={() => { if (destination && destination.length > 2) handleDestChange(destination) }}
                  placeholder="e.g. Hamra Street, next to Starbucks"
                  className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-medium text-gray-900"
                />
                {destResults.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {destResults.map((p, i) => (
                      <li key={p.place_id || i} onMouseDown={() => selectDest(p)} className="p-3 hover:bg-red-50 cursor-pointer border-b border-gray-100 text-sm font-medium text-gray-800">
                        {p.name || p.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {(!pickupLat || !destLat) && (
              <p className="text-sm text-red-500 font-medium text-center">
                * Please select your exact locations from the dropdown menus to proceed.
              </p>
            )}

            <button 
              type="submit"
              disabled={saving || !pickupLat || !destLat}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-orange-500/30 transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:transform-none"
            >
              {saving ? 'Confirming...' : 'Confirm Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
