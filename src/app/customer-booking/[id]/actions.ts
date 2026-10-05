'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateRouteAndDistance } from '@/lib/maps/routingService'
import { calculateFare } from '@/utils/pricingCalculator'

export async function submitBookingForm(
  sessionId: string, 
  pickup: string, pickupLat: number, pickupLng: number,
  destination: string, destLat: number, destLng: number
) {
  const supabase = await createClient()

  // 1. Get session
  const { data: session } = await supabase.from('whatsapp_sessions').select('*').eq('id', sessionId).single()
  if (!session) throw new Error("Session not found")

  // 2. Update session with exact coordinates and move to review
  await supabase.from('whatsapp_sessions').update({
    extracted_pickup: pickup,
    extracted_pickup_lat: pickupLat,
    extracted_pickup_lng: pickupLng,
    extracted_destination: destination,
    extracted_destination_lat: destLat,
    extracted_destination_lng: destLng,
    missing_fields: [],
    session_status: 'ready_for_operator_review',
    is_ride_confirmed: true
  }).eq('id', sessionId)

  // 3. Draft order
  const { data: order } = await supabase.from('orders').insert([{
    customer_phone: session.customer_phone,
    customer_name: session.extracted_customer_name || 'WhatsApp Customer',
    pickup_address: pickup,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    destination_address: destination,
    destination_lat: destLat,
    destination_lng: destLng,
    status: 'ai_draft',
    notes: session.extracted_notes
  }]).select().single()

  if (order) {
    await supabase.from('whatsapp_sessions').update({ linked_order_id: order.id }).eq('id', sessionId)
  }

  // 4. Calculate exact price and routing!
  let priceMsg = "We are reviewing your route."
  try {
    const routeInfo = await calculateRouteAndDistance(pickupLat, pickupLng, destLat, destLng)
    
    // Get active pricing rules
    const { data: rules } = await supabase.from('pricing_rules').select('*').eq('is_active', true)
    if (rules && rules.length > 0) {
      // Default to first active vehicle type (usually economy)
      const fare = calculateFare(routeInfo.distanceKm, rules[0].vehicle_type, new Date(), 0, rules)
      
      priceMsg = `📍 *Pickup:* ${pickup}
🚩 *Drop-off:* ${destination}
🛣️ *Distance:* ${routeInfo.distanceKm.toFixed(1)} km
⏱️ *Est. Time:* ${routeInfo.durationMinutes} mins
💰 *Price Quote:* $${fare.finalFare.toFixed(2)}

Reply *YES* to confirm this ride, or *NO* to cancel.`
    }
  } catch (err) {
    console.error("Pricing calculation failed in booking form", err)
  }

  // 5. Send exact quote back via WhatsApp!
  await supabase.from('whatsapp_messages').insert([{
    session_id: sessionId,
    direction: 'outbound',
    message_type: 'text',
    raw_text: priceMsg
  }])

  return { success: true }
}
