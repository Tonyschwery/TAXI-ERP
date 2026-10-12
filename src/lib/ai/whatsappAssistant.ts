import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

export async function processWhatsAppSessionWithAI(sessionId: string) {
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

  const latestMessage = messages[messages.length - 1]

  // 3. Fetch Customer info (if known)
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', session.customer_phone)
    .single()

  // 4. Fetch Dialect Landmarks
  const { data: landmarks } = await supabase.from('dialect_landmarks').select('*')

  // 5. Fetch Available Drivers Count/ETA
  const { data: availableDrivers } = await supabase
    .from('drivers')
    .select('id, current_lat, current_lng, vehicle_id')
    .eq('availability', 'available')

  // 6. Init Gemini & App URL
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://taxi-erp.vercel.app').replace(/\/$/, '')

  // 7. System Prompt Specialized for Lebanon/Syria
  const systemPrompt = `You are an expert AI Taxi Dispatch Operator in Lebanon. 
You understand Lebanese Arabic, Syrian Arabic, Arabizi (Franco-Arabic), French, and English perfectly.
You must extract the exact ride details and missing information from the conversation history.

Context provided:
- Customer Name: ${customer?.full_name || 'Unknown'}
- Known Landmarks: ${JSON.stringify(landmarks?.map(l => l.name_ar))}
- Available Cars Nearby: ${availableDrivers?.length || 0}

Instructions:
1. Analyze the customer's intent.
2. Extract the Pickup and Destination locations. 
3. **CRITICAL FOR PICKUP:** If the user has NOT provided a WhatsApp Location Pin (JSON lat/lng), and their pickup text is a broad area/city (like "Zouk Mosbeh" or "Antelias"), you MUST add "pickup_gps" to "missing_fields". A WhatsApp pin is highly preferred unless it's a very famous exact landmark (like "ABC Mall").
4. **CRITICAL FOR PINS:** If the conversation history shows a message with a JSON object like {"lat": 33.89, "lng": 35.50}, this is a WhatsApp Location Pin. Extract these numbers into "extracted_pickup_lat" and "extracted_pickup_lng".
5. **NEGOTIATION:** If you have the pickup and destination, you must give the customer an estimated cost (invent a realistic USD price for Lebanon between $5 and $25) and ask them if they confirm the ride. 
6. **CONFIRMATION:** Set "is_ride_confirmed" to true ONLY if the customer explicitly says "Yes / OK / Confirm / Send it" AFTER you have given them the price estimate and locations. If they are still negotiating, or you just asked them for confirmation, keep it false!
7. "suggested_operator_reply" MUST be a polite response asking for missing info, OR giving the price quote and asking for confirmation, OR saying "Your car is on the way!". YOU MUST REPLY IN THE EXACT SAME LANGUAGE THE CUSTOMER USED (e.g. if they speak English, reply in English).
If they are missing locations, ALWAYS include this exact booking form link in your reply so they can fill it out themselves: ${appUrl}/customer-booking/${session.id}
8. YOU MUST OUTPUT STRICT JSON MATCHING THIS EXACT SCHEMA:
{
  "voice_transcription_ar": "string or null",
  "voice_translation_en": "string or null",
  "detected_intent": "string",
  "extracted_customer_name": "string or null",
  "extracted_pickup": "string or null",
  "extracted_pickup_lat": 33.89,
  "extracted_pickup_lng": 35.50,
  "extracted_destination": "string or null",
  "extracted_time": "string",
  "extracted_passengers": 1,
  "extracted_notes": "string",
  "missing_fields": ["pickup", "destination", "pickup_gps"],
  "is_ride_confirmed": false,
  "ai_confidence_score": 0.95,
  "suggested_operator_reply": "string"
}
`

  // 8. Prepare Messages History
  let userContent = "Conversation History:\n"
  for (const msg of messages) {
    if (msg.message_type === 'audio') {
      // In a real scenario, we would download the WhatsApp OGG file and pass the bytes directly to Gemini 2.5 Flash
      // For this step, we will pass a placeholder indicating audio was received if we don't have bytes
      userContent += `[Audio Message ID: ${msg.raw_text}]\n(Simulate transcription based on typical booking audio if no bytes available)\n`
    } else {
      userContent += `${msg.direction === 'inbound' ? 'Customer' : 'Bot'}: ${msg.raw_text}\n`
    }
  }

  let aiText = ''
  let retries = 3
  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
      aiText = response.text || ''
      break; // Success, break out of retry loop
    } catch (err: any) {
      console.warn('Gemini 3.5 Flash error:', err.message || err)
      try {
        console.warn('Attempting gemini-3.1-flash-lite fallback...')
        const proResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
        aiText = proResponse.text || ''
        break;
      } catch (proErr: any) {
        console.error('Both Flash and Pro models failed:', proErr)
        retries--
        if (retries === 0) {
          const fallbackMsg = `Our AI is currently experiencing high volume. Please secure your ride directly using this link:\n${appUrl}/customer-booking/${session.id}`
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
        await new Promise(resolve => setTimeout(resolve, 2000))
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

  // 10. Update the WhatsApp Session state
  let newStatus = session.session_status

  // Merge new AI extractions with existing session data
  const mergedPickup = parsed.extracted_pickup || session.extracted_pickup
  const mergedDestination = parsed.extracted_destination || session.extracted_destination
  const missing = new Set(parsed.missing_fields || [])
  if (!mergedPickup) missing.add('pickup')
  if (!mergedDestination) missing.add('destination')

  const missingArray = Array.from(missing)

  if (missingArray.length === 0 && parsed.is_ride_confirmed) {
    newStatus = 'ready_for_operator_review'
  } else {
    newStatus = 'awaiting_info'
  }

  await supabase.from('whatsapp_sessions').update({
    session_status: newStatus,
    detected_intent: parsed.detected_intent,
    extracted_customer_name: parsed.extracted_customer_name || session.extracted_customer_name,
    extracted_pickup: mergedPickup,
    extracted_pickup_lat: parsed.extracted_pickup_lat || session.extracted_pickup_lat,
    extracted_pickup_lng: parsed.extracted_pickup_lng || session.extracted_pickup_lng,
    extracted_destination: mergedDestination,
    extracted_time: parsed.extracted_time,
    extracted_passengers: parsed.extracted_passengers || 1,
    extracted_notes: parsed.extracted_notes,
    missing_fields: missingArray,
    ai_confidence_score: parsed.ai_confidence_score,
    suggested_operator_reply: parsed.suggested_operator_reply
  }).eq('id', session.id)

  // 11. Auto-Draft Order if fully ready
  if (newStatus === 'ready_for_operator_review' && !session.linked_order_id) {
    // Generate a draft order in the DB
    const { data: order } = await supabase.from('orders').insert([{
      customer_id: customer?.id || null,
      customer_phone: session.customer_phone,
      customer_name: parsed.extracted_customer_name || customer?.full_name || 'WhatsApp Customer',
      pickup_address: mergedPickup,
      pickup_lat: parsed.extracted_pickup_lat || session.extracted_pickup_lat || null,
      pickup_lng: parsed.extracted_pickup_lng || session.extracted_pickup_lng || null,
      destination_address: mergedDestination,
      status: 'ai_draft',
      notes: parsed.extracted_notes
      // Ideally we would also call routingService here to geocode the addresses
      // and calculate the fare immediately for the operator to review.
    }]).select().single()

    if (order) {
      await supabase.from('whatsapp_sessions').update({ linked_order_id: order.id }).eq('id', session.id)
    }
  }

  // 12. Automatically send the reply back to the customer if the AI generated one
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
