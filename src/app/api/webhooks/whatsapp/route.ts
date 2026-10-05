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

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  
  return new NextResponse('Forbidden', { status: 403 })
}

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
    if (msgType === 'text') content = message.text.body
    else if (msgType === 'audio') content = message.audio.id
    else if (msgType === 'location') content = JSON.stringify({ lat: message.location.latitude, lng: message.location.longitude })
    else content = `[Received unsupported message type: ${msgType}]`

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Upsert Customer (Just in case they don't exist yet)
    // We could do this strictly in order creation, but good to track them now.
    await supabase.from('customers').upsert({
      phone: normalizedPhone,
      full_name: senderName
    }, { onConflict: 'phone', ignoreDuplicates: true })

    // 4. Find Active Session
    // A session is active if it's not dispatched/closed and created within the last 2 hours.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    
    let { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('customer_phone', normalizedPhone)
      .eq('whatsapp_business_number', lineIdentifier)
      .in('session_status', ['active', 'bot_handling', 'human_escalated', 'awaiting_info'])
      .gte('last_message_at', twoHoursAgo)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single()

    if (!session) {
      // Create new session
      const { data: newSession, error: sessionErr } = await supabase
        .from('whatsapp_sessions')
        .insert([{
          customer_phone: normalizedPhone,
          whatsapp_business_number: lineIdentifier,
          session_status: 'bot_handling' // Default handoff to AI
        }])
        .select()
        .single()
      
      if (sessionErr) throw sessionErr
      session = newSession
    } else {
      // Update session timestamp
      await supabase.from('whatsapp_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session.id)
    }

    // 5. Save incoming message
    await supabase
      .from('whatsapp_messages')
      .insert([{
        session_id: session.id,
        direction: 'inbound',
        message_type: msgType,
        raw_text: content
      }])

    // 6. Trigger AI Processor if bot is handling
    if (session.session_status === 'bot_handling' || session.session_status === 'awaiting_info') {
      console.log(`[WhatsApp] Triggering AI processing for Session ${session.id}`)
      processWhatsAppSessionWithAI(session.id).catch(err => {
        console.error('[AI Processing Error]', err)
      })
    }

    return NextResponse.json({ status: 'success' })

  } catch (error: any) {
    console.error('[WhatsApp Webhook Error]', error.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
