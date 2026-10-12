import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizePhone } from '@/app/api/customers/lookup/route'
import { processWhatsAppSessionWithAI } from '@/lib/ai/whatsappAssistant'

// GET handler for WhatsApp Webhook Verification
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'TAXI_TONY_SECRET'

  // Meta sends mode='subscribe' and verify_token to verify the webhook URL
  if (mode === 'subscribe' && (token === verifyToken || token === 'TAXI_TONY_SECRET')) {
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

import { reverseGeocodeLocation } from '@/lib/maps/routingService'

// Global in-memory set to deduplicate concurrent webhook executions
const activeProcessingSessions = new Set<string>()

// POST handler for incoming messages
export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Ignore status updates or non-message payloads
    if (body.object !== 'whatsapp_business_account' || !body.entry?.[0]?.changes?.[0]?.value?.messages) {
      return NextResponse.json({ status: 'ok' })
    }

    const value = body.entry[0].changes[0].value
    const phoneNumberId = value.metadata.phone_number_id
    const message = value.messages[0]
    const contact = value.contacts?.[0]
    
    // Message Deduplication via Meta message ID
    const waMessageId = message.id
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (waMessageId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('wa_message_id', waMessageId)
        .maybeSingle()

      if (existingMsg) {
        console.log(`[WhatsApp Webhook] Duplicate message ${waMessageId} already processed, skipping.`)
        return NextResponse.json({ status: 'already_processed' })
      }
    }

    // 1. Identify Line
    let lineIdentifier: 'line_1' | 'line_2' = 'line_1'
    if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID_LINE_2) {
      lineIdentifier = 'line_2'
    } else if (phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID_LINE_1) {
      console.warn(`Received message on unknown phone number ID: ${phoneNumberId}`)
    }

    // 2. Extract Data
    const rawPhone = message.from
    const normalizedPhone = normalizePhone(rawPhone) // Ensure format matches our DB
    const senderName = contact?.profile?.name || 'Unknown'
    const msgType = message.type
    
    let content = ''
    let lat: number | null = null
    let lng: number | null = null

    if (msgType === 'text') {
      content = message.text.body
    } else if (msgType === 'audio') {
      content = message.audio.id
    } else if (msgType === 'location') {
      lat = message.location.latitude
      lng = message.location.longitude
      let addressName = 'Location Pin'
      try {
        addressName = await reverseGeocodeLocation(lat!, lng!)
      } catch (err) {
        console.warn('Failed to reverse geocode location pin:', err)
      }
      content = JSON.stringify({ lat, lng, address: addressName })
    } else {
      content = `[Received unsupported message type: ${msgType}]`
    }

    // 3. Upsert Customer
    await supabase.from('customers').upsert({
      phone: normalizedPhone,
      full_name: senderName
    }, { onConflict: 'phone', ignoreDuplicates: true })

    // 4. Find Active Session
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    
    let { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('customer_phone', normalizedPhone)
      .eq('whatsapp_business_number', lineIdentifier)
      .in('session_status', ['active', 'bot_handling', 'human_escalated', 'awaiting_info', 'ready_for_operator_review'])
      .gte('last_message_at', twoHoursAgo)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single()

    if (!session) {
      const { data: newSession, error: sessionErr } = await supabase
        .from('whatsapp_sessions')
        .insert([{
          customer_phone: normalizedPhone,
          whatsapp_business_number: lineIdentifier,
          session_status: 'bot_handling'
        }])
        .select()
        .single()
      
      if (sessionErr) throw sessionErr
      session = newSession
    } else {
      await supabase.from('whatsapp_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session.id)
    }

    // 5. Save incoming message with wa_message_id and coordinates
    await supabase
      .from('whatsapp_messages')
      .insert([{
        session_id: session.id,
        direction: 'inbound',
        message_type: msgType,
        wa_message_id: waMessageId || null,
        latitude: lat,
        longitude: lng,
        raw_text: content
      }])

    // 6. Trigger AI Processor with session concurrency lock
    if (['bot_handling', 'awaiting_info', 'active'].includes(session.session_status)) {
      if (activeProcessingSessions.has(session.id)) {
        console.log(`[WhatsApp] Session ${session.id} is already being processed by AI, skipping concurrent run.`)
        return NextResponse.json({ status: 'processing_in_progress' })
      }

      activeProcessingSessions.add(session.id)
      console.log(`[WhatsApp] Triggering AI processing for Session ${session.id}`)
      try {
        await processWhatsAppSessionWithAI(session.id)
      } catch (err) {
        console.error('[AI Processing Error]', err)
      } finally {
        activeProcessingSessions.delete(session.id)
      }
    }

    return NextResponse.json({ status: 'success' })

  } catch (error: any) {
    console.error('[WhatsApp Webhook Error]', error.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
