import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { 
  calculateRouteAndDistance, 
  getHaversineDistance, 
  reverseGeocodeLocation, 
  geocodePlaceName 
} from '@/lib/maps/routingService'
import { getNearestDrivers } from '@/lib/maps/nearestDriverEngine'
import { calculateFare, PricingRule } from '@/utils/pricingCalculator'

/**
 * WhatsApp Bot Engine
 * Responsible for:
 * - Inspecting WhatsApp chat history and location pins
 * - Detecting location discrepancies (e.g. pinned GPS vs typed area)
 * - Geocoding destination and pickup locations
 * - Calculating real driving routes, distance, and fares via active pricing rules
 * - Running AI dialog generation (gemini-3.1-flash-lite with fallback)
 * - Auto-creating / updating orders in Live Dispatch & assigning nearest available driver
 * - Updating WhatsApp session status (awaiting_info, ready_for_operator_review, dispatched)
 * - Sending outbound replies to the customer via Meta WhatsApp Cloud API
 */
export async function runWhatsAppBotEngine(sessionId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Fetch Session
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error('Session not found')

  // 2. Fetch Messages (chronological)
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (!messages || messages.length === 0) return

  // 3. Fetch Customer info (if known)
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', session.customer_phone)
    .single()

  // 4. Fetch Dialect Landmarks
  const { data: landmarks } = await supabase.from('dialect_landmarks').select('*')

  // 5. Fetch Active Pricing Rules
  const { data: pricingRules } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)

  // 6. Inspect Location Pins in Messages History
  let latestPinLat: number | null = session.extracted_pickup_lat || null
  let latestPinLng: number | null = session.extracted_pickup_lng || null
  let latestPinAddress: string | null = null

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.message_type === 'location' || (msg.latitude && msg.longitude)) {
      latestPinLat = msg.latitude
      latestPinLng = msg.longitude
      if (msg.raw_text) {
        try {
          const parsedLoc = JSON.parse(msg.raw_text)
          if (parsedLoc.lat && parsedLoc.lng) {
            latestPinLat = parsedLoc.lat
            latestPinLng = parsedLoc.lng
            latestPinAddress = parsedLoc.address || null
          }
        } catch (e) {}
      }
      break
    } else if (msg.raw_text && msg.raw_text.includes('"lat"') && msg.raw_text.includes('"lng"')) {
      try {
        const parsedLoc = JSON.parse(msg.raw_text)
        if (parsedLoc.lat && parsedLoc.lng) {
          latestPinLat = parsedLoc.lat
          latestPinLng = parsedLoc.lng
          latestPinAddress = parsedLoc.address || null
          break
        }
      } catch (e) {}
    }
  }

  // Reverse geocode pin if we have coordinates but no address
  if (latestPinLat && latestPinLng && !latestPinAddress) {
    try {
      latestPinAddress = await reverseGeocodeLocation(latestPinLat, latestPinLng)
    } catch (e) {
      console.warn('Failed to reverse geocode pin:', e)
    }
  }

  // Check if destination has coordinates, or geocode it
  let destLat: number | null = session.extracted_destination_lat || null
  let destLng: number | null = session.extracted_destination_lng || null
  let destAddress: string | null = session.extracted_destination || null

  if (destAddress && (!destLat || !destLng)) {
    try {
      const geocoded = await geocodePlaceName(destAddress)
      if (geocoded) {
        destLat = geocoded.lat
        destLng = geocoded.lng
        destAddress = geocoded.formattedAddress
      }
    } catch (e) {
      console.warn('Failed to geocode destination:', e)
    }
  }

  // 7. Calculate real route and fare if coordinates are available
  let calculatedDistanceKm = 0
  let calculatedDurationMin = 0
  let calculatedFareUSD = 0
  let routePolyline: string | null = null

  if (latestPinLat && latestPinLng && destLat && destLng) {
    try {
      const routeInfo = await calculateRouteAndDistance(latestPinLat, latestPinLng, destLat, destLng)
      calculatedDistanceKm = routeInfo.distanceKm
      calculatedDurationMin = routeInfo.durationMinutes
      routePolyline = routeInfo.polyline

      if (pricingRules && pricingRules.length > 0) {
        const fare = calculateFare(calculatedDistanceKm, 'sedan', new Date(), 0, pricingRules as PricingRule[])
        calculatedFareUSD = fare.finalFare
      }
    } catch (err) {
      console.warn('Failed to calculate route and fare:', err)
    }
  }

  // 8. Fetch Available Drivers nearby
  const { data: availableDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, driver_code, current_lat, current_lng, vehicle_type, availability')
    .eq('is_active', true)
    .eq('availability', 'available')

  // Detect location mismatch between typed pickup and pinned GPS
  let discrepancyNotice = ''
  if (latestPinLat && latestPinLng && latestPinAddress && session.extracted_pickup) {
    // If the customer typed an area that doesn't match the pin address
    const pinLower = latestPinAddress.toLowerCase()
    const pickupLower = session.extracted_pickup.toLowerCase()
    const isMismatch = !pinLower.includes(pickupLower) && !pickupLower.includes(pinLower)

    if (isMismatch) {
      discrepancyNotice = `DISCREPANCY ALERT: The customer previously typed pickup as "${session.extracted_pickup}", but their WhatsApp GPS location pin is actually in "${latestPinAddress}".
If the customer has NOT yet clarified which location they want, you MUST ask politely:
"I noticed your location pin is in ${latestPinAddress}, but you asked for a ride from ${session.extracted_pickup}. Would you like to be picked up from your pin in ${latestPinAddress} or from ${session.extracted_pickup}?"
If the customer already confirmed ("yes", "from my location", "from here", "zouk"), use the pin address "${latestPinAddress}" as the definitive pickup location.`
    }
  }

  // 9. Init Gemini & App URL
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  // Customer links sent via WhatsApp must ALWAYS point to the live hosted production URL
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://taxi-erp.vercel.app'
  ).replace(/\/$/, '')

  // 10. System Prompt
  const systemPrompt = `You are an expert AI Taxi Dispatch Operator in Lebanon.
You understand Lebanese Arabic, Syrian Arabic, Arabizi (Franco-Arabic), French, and English perfectly.
You must extract the exact ride details and missing information from the conversation history.

Context provided:
- Customer Name: ${customer?.full_name || session.extracted_customer_name || 'Customer'}
- Customer Phone: ${session.customer_phone}
- Pinned GPS Coordinates: ${latestPinLat && latestPinLng ? `${latestPinLat}, ${latestPinLng} (${latestPinAddress || 'Location Pin'})` : 'None'}
- Known Destination Coordinates: ${destLat && destLng ? `${destLat}, ${destLng} (${destAddress || ''})` : 'None'}
${calculatedFareUSD > 0 ? `- Exact System Route: ${calculatedDistanceKm.toFixed(1)} km (~${calculatedDurationMin} mins), Exact Fare: $${calculatedFareUSD.toFixed(2)}` : ''}
- Available Drivers Nearby: ${availableDrivers?.length || 0}
${discrepancyNotice ? `\n${discrepancyNotice}\n` : ''}

Instructions:
1. Analyze the customer's intent.
2. Extract the Pickup and Destination locations.
3. If a WhatsApp Location Pin was provided, set "extracted_pickup_lat" and "extracted_pickup_lng" to those coordinates, and use the pin's address name (${latestPinAddress || 'pinned location'}) for pickup.
4. CONFIRMATION HANDLING:
   - Set "is_ride_confirmed" to TRUE only if:
     a) Both pickup and destination are known.
     b) A price estimate or confirmation question was already presented to the customer.
     c) The customer responds with confirmation ("Yes", "OK", "Yalla", "Confirm", "Send car", "موافق", "تمام", etc.).
   - If they are still asking questions or just provided the locations for the first time, keep "is_ride_confirmed" to FALSE and provide the price quote.
5. PRICING:
   ${calculatedFareUSD > 0 
     ? `Always quote the exact calculated system fare: $${calculatedFareUSD.toFixed(2)}.` 
     : `Give a realistic estimated price between $10 and $25 USD.`}
6. REPLY LANGUAGE: Reply in the EXACT same language/dialect the customer used (English, Arabic, Franco, French).
7. If the customer confirmed the ride ("is_ride_confirmed": true), say "Your ride is confirmed! Your driver is on the way!" and summarize the trip.
8. If any critical info is missing, ask for it politely.

YOU MUST OUTPUT STRICT JSON MATCHING THIS EXACT SCHEMA:
{
  "voice_transcription_ar": null,
  "voice_translation_en": null,
  "detected_intent": "book_ride",
  "extracted_customer_name": "string or null",
  "extracted_pickup": "string or null",
  "extracted_pickup_lat": number or null,
  "extracted_pickup_lng": number or null,
  "extracted_destination": "string or null",
  "extracted_time": "now",
  "extracted_passengers": 1,
  "extracted_notes": "string",
  "missing_fields": [],
  "is_ride_confirmed": false,
  "ai_confidence_score": 0.95,
  "suggested_operator_reply": "string"
}
`

  // 11. Prepare Messages History
  let userContent = "Conversation History:\n"
  for (const msg of messages) {
    if (msg.message_type === 'audio') {
      userContent += `[Audio Message ID: ${msg.raw_text}]\n`
    } else if (msg.message_type === 'location') {
      userContent += `Customer [Shared Location Pin]: ${latestPinAddress || msg.raw_text}\n`
    } else {
      userContent += `${msg.direction === 'inbound' ? 'Customer' : 'Bot'}: ${msg.raw_text}\n`
    }
  }

  let aiText = ''
  let retries = 3
  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
      aiText = response.text || ''
      break
    } catch (err: any) {
      console.warn('Gemini 3.1 Flash-Lite error:', err.message || err)
      try {
        console.warn('Attempting gemini-3.5-flash fallback...')
        const proResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
        aiText = proResponse.text || ''
        break
      } catch (proErr: any) {
        console.error('Both models failed:', proErr)
        retries--
        if (retries === 0) {
          const fallbackMsg = `Thank you! Please secure your ride directly using this link:\n${appUrl}/customer-booking/${session.id}`
          await supabase.from('whatsapp_sessions').update({
            session_status: 'human_escalated',
            extracted_notes: 'AI Overloaded: ' + (proErr.message || err.message)
          }).eq('id', session.id)

          await supabase.from('whatsapp_messages').insert([{
            session_id: session.id,
            direction: 'outbound',
            message_type: 'text',
            raw_text: fallbackMsg
          }])

          const line = (session.whatsapp_business_number as 'line_1' | 'line_2') || 'line_1'
          try {
            await sendWhatsAppMessage(line, session.customer_phone, fallbackMsg)
          } catch (e: any) {
            console.error('[WhatsApp Send Fallback Error]', e.message)
          }
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(aiText)
  } catch (e) {
    console.error('Failed to parse AI JSON', aiText)
    await supabase.from('whatsapp_sessions').update({ session_status: 'human_escalated' }).eq('id', session.id)
    return
  }

  // 12. Resolve Pickup and Destination details
  let finalPickup = parsed.extracted_pickup || session.extracted_pickup || latestPinAddress || 'Current Location'
  let finalPickupLat = parsed.extracted_pickup_lat || latestPinLat || session.extracted_pickup_lat
  let finalPickupLng = parsed.extracted_pickup_lng || latestPinLng || session.extracted_pickup_lng

  let finalDest = parsed.extracted_destination || session.extracted_destination || destAddress
  let finalDestLat = parsed.extracted_destination_lat || destLat || session.extracted_destination_lat
  let finalDestLng = parsed.extracted_destination_lng || destLng || session.extracted_destination_lng

  // If destination text exists but no coordinates, attempt geocode
  if (finalDest && (!finalDestLat || !finalDestLng)) {
    try {
      const g = await geocodePlaceName(finalDest)
      if (g) {
        finalDestLat = g.lat
        finalDestLng = g.lng
        finalDest = g.formattedAddress
      }
    } catch (e) {}
  }

  // If pickup text exists but no coordinates, attempt geocode
  if (finalPickup && (!finalPickupLat || !finalPickupLng)) {
    try {
      const g = await geocodePlaceName(finalPickup)
      if (g) {
        finalPickupLat = g.lat
        finalPickupLng = g.lng
        finalPickup = g.formattedAddress
      }
    } catch (e) {}
  }

  // Recalculate route & fare if now available
  if (finalPickupLat && finalPickupLng && finalDestLat && finalDestLng && calculatedFareUSD === 0) {
    try {
      const rInfo = await calculateRouteAndDistance(finalPickupLat, finalPickupLng, finalDestLat, finalDestLng)
      calculatedDistanceKm = rInfo.distanceKm
      calculatedDurationMin = rInfo.durationMinutes
      routePolyline = rInfo.polyline
      if (pricingRules && pricingRules.length > 0) {
        const fare = calculateFare(calculatedDistanceKm, 'sedan', new Date(), 0, pricingRules as PricingRule[])
        calculatedFareUSD = fare.finalFare
      }
    } catch (e) {}
  }

  const missing = new Set(parsed.missing_fields || [])
  if (!finalPickup) missing.add('pickup')
  if (!finalDest) missing.add('destination')
  const missingArray = Array.from(missing)

  const isConfirmed = Boolean(parsed.is_ride_confirmed && missingArray.length === 0)
  const newStatus = isConfirmed ? 'dispatched' : (missingArray.length === 0 ? 'ready_for_operator_review' : 'awaiting_info')

  // 13. LIVE DISPATCH INTEGRATION: Find Driver & Create/Update Order
  let assignedDriver: any = null
  let orderNumber = 0
  let orderId = session.linked_order_id

  if (isConfirmed) {
    // Search for nearest available driver if coordinates exist
    if (finalPickupLat && finalPickupLng) {
      try {
        const nearestDrivers = await getNearestDrivers(finalPickupLat, finalPickupLng, 'any')
        if (nearestDrivers && nearestDrivers.length > 0) {
          assignedDriver = nearestDrivers[0]
        }
      } catch (err) {
        console.warn('Failed to query nearest drivers:', err)
      }
    }

    const finalFareAmount = calculatedFareUSD > 0 ? calculatedFareUSD : 15.00

    const orderPayload: any = {
      customer_id: customer?.id || null,
      customer_phone: session.customer_phone,
      customer_name: parsed.extracted_customer_name || customer?.full_name || 'WhatsApp Customer',
      source: session.whatsapp_business_number === 'line_2' ? 'whatsapp_2' : 'whatsapp_1',
      whatsapp_line_number: session.whatsapp_business_number,
      pickup_address: finalPickup,
      pickup_lat: finalPickupLat,
      pickup_lng: finalPickupLng,
      destination_address: finalDest || 'Destination TBD',
      destination_lat: finalDestLat,
      destination_lng: finalDestLng,
      distance_km: calculatedDistanceKm,
      estimated_duration_min: calculatedDurationMin,
      calculated_fare: finalFareAmount,
      extra_charges: 0,
      final_fare: finalFareAmount,
      vehicle_type_requested: 'sedan',
      payment_method_code: 'cash',
      passengers: parsed.extracted_passengers || 1,
      scheduled_at: new Date().toISOString(),
      notes: parsed.extracted_notes || '',
      status: assignedDriver ? 'assigned' : 'pending',
      assigned_driver_id: assignedDriver ? assignedDriver.id : null,
      assigned_at: assignedDriver ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }

    if (orderId) {
      const { data: updatedOrder } = await supabase
        .from('orders')
        .update(orderPayload)
        .eq('id', orderId)
        .select()
        .single()

      if (updatedOrder) {
        orderNumber = updatedOrder.order_number
      }
    } else {
      const { data: newOrder } = await supabase
        .from('orders')
        .insert([orderPayload])
        .select()
        .single()

      if (newOrder) {
        orderId = newOrder.id
        orderNumber = newOrder.order_number
      }
    }

    // If driver was assigned, update driver availability to busy
    if (assignedDriver) {
      await supabase
        .from('drivers')
        .update({ availability: 'busy' })
        .eq('id', assignedDriver.id)
    }

    // Enrich the suggested operator reply with driver & live dispatch details
    if (assignedDriver) {
      parsed.suggested_operator_reply = `🚖 *Ride Confirmed!* (Order #${orderNumber})\n` +
        `• *Driver:* ${assignedDriver.name} (${assignedDriver.vehicleType || 'Sedan'})\n` +
        `• *Driver ETA:* ~${assignedDriver.etaMins} mins\n` +
        `• *Pickup:* ${finalPickup}\n` +
        `• *Drop-off:* ${finalDest}\n` +
        `• *Fare:* $${finalFareAmount.toFixed(2)} cash\n\n` +
        `Your driver is on the way!`
    } else {
      parsed.suggested_operator_reply = `🚖 *Ride Confirmed!* (Order #${orderNumber})\n` +
        `• *Pickup:* ${finalPickup}\n` +
        `• *Drop-off:* ${finalDest}\n` +
        `• *Fare:* $${finalFareAmount.toFixed(2)} cash\n\n` +
        `Your order has been sent to our live dispatch screen. We are dispatching the closest driver to you right now!`
    }
  }

  // 14. Update WhatsApp Session State
  await supabase.from('whatsapp_sessions').update({
    session_status: newStatus,
    detected_intent: parsed.detected_intent,
    extracted_customer_name: parsed.extracted_customer_name || session.extracted_customer_name,
    extracted_pickup: finalPickup,
    extracted_pickup_lat: finalPickupLat,
    extracted_pickup_lng: finalPickupLng,
    extracted_destination: finalDest,
    extracted_destination_lat: finalDestLat,
    extracted_destination_lng: finalDestLng,
    extracted_time: parsed.extracted_time,
    extracted_passengers: parsed.extracted_passengers || 1,
    extracted_notes: parsed.extracted_notes,
    missing_fields: missingArray,
    ai_confidence_score: parsed.ai_confidence_score,
    suggested_operator_reply: parsed.suggested_operator_reply,
    linked_order_id: orderId || session.linked_order_id,
    last_message_at: new Date().toISOString()
  }).eq('id', session.id)

  // 15. Send Outbound WhatsApp Reply
  if (parsed.suggested_operator_reply) {
    await supabase.from('whatsapp_messages').insert([{
      session_id: session.id,
      direction: 'outbound',
      message_type: 'text',
      raw_text: parsed.suggested_operator_reply
    }])

    const line = (session.whatsapp_business_number as 'line_1' | 'line_2') || 'line_1'
    try {
      await sendWhatsAppMessage(line, session.customer_phone, parsed.suggested_operator_reply)
    } catch (err: any) {
      console.error('[WhatsApp Send Error]', err.message)
    }
  }
}
