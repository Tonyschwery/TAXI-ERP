'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import OrderEntryForm from './OrderEntryForm'

export default function WhatsAppAIQueue() {
  const supabase = createClient()

  const [sessions, setSessions] = useState<any[]>([])
  const [messages, setMessages] = useState<Record<string, any[]>>({})
  const [reviewOrder, setReviewOrder] = useState<any>(null)

  // Quick reply drafts (keyed by session_id)
  const [replies, setReplies] = useState<Record<string, string>>({})

  // Simulator State
  const [showSimulator, setShowSimulator] = useState(false)
  const [simLine, setSimLine] = useState('line_1')
  const [simPhone, setSimPhone] = useState('9613123456')
  const [simName, setSimName] = useState('Tony')
  const [simType, setSimType] = useState('text')
  const [simContent, setSimContent] = useState('I need a car to Hamra')

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .in('session_status', ['awaiting_info', 'ready_for_operator_review', 'bot_handling', 'human_escalated'])
      .order('last_message_at', { ascending: false })

    if (error) console.error('Error fetching sessions:', error)

    if (data) {
      setSessions(data)
      // Pre-fill replies
      const newReplies: Record<string, string> = {}
      data.forEach(s => {
        if (s.suggested_operator_reply && !replies[s.id]) {
          newReplies[s.id] = s.suggested_operator_reply
        }
      })
      if (Object.keys(newReplies).length > 0) {
        setReplies(prev => ({ ...prev, ...newReplies }))
      }

      // Fetch messages for these sessions
      const sessionIds = data.map(s => s.id)
      if (sessionIds.length > 0) {
        const { data: msgs } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: true })

        if (msgs) {
          const grouped: Record<string, any[]> = {}
          msgs.forEach(m => {
            if (!grouped[m.session_id]) grouped[m.session_id] = []
            grouped[m.session_id].push(m)
          })
          setMessages(grouped)
        }
      }
    }
  }

  useEffect(() => {
    fetchSessions()

    const channel = supabase.channel('wa_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions' }, () => {
        fetchSessions()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => {
        fetchSessions() // Brute force refresh for simplicity
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const handleSendReply = async (session: any) => {
    const text = replies[session.id]
    if (!text) return

    // Opt: Send to WA via an API route, for now we mock it by inserting to DB directly
    await supabase.from('whatsapp_messages').insert([{
      session_id: session.id,
      direction: 'outbound',
      message_type: 'text',
      raw_text: text
    }])

    // Optionally update status back to bot_handling or active
    // await supabase.from('whatsapp_sessions').update({ session_status: 'bot_handling' }).eq('id', session.id)
  }

  const handleDismissSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to dismiss this conversation?')) return
    await supabase.from('whatsapp_sessions').update({ session_status: 'closed' }).eq('id', sessionId)
    fetchSessions()
  }

  const handleSimulate = async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            metadata: {
              phone_number_id: simLine === 'line_1' ? process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID_LINE_1 || 'id1' : 'id2'
            },
            contacts: [{ profile: { name: simName } }],
            messages: [{
              from: simPhone,
              type: simType,
              text: simType === 'text' ? { body: simContent } : undefined,
              audio: simType === 'audio' ? { id: simContent } : undefined, // Just a mock ID
              location: simType === 'location' ? { latitude: 33.89, longitude: 35.50 } : undefined
            }]
          }
        }]
      }]
    }

    await fetch('/api/webhooks/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    setShowSimulator(false)
  }

  const awaitingInfo = sessions.filter(s => s.session_status === 'awaiting_info' || s.session_status === 'human_escalated' || s.session_status === 'bot_handling')
  const readyForReview = sessions.filter(s => s.session_status === 'ready_for_operator_review')

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Live Incoming WhatsApp</h2>
        <button onClick={() => setShowSimulator(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg">
          🧪 Simulate Incoming WhatsApp
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Left Column: Awaiting Info / Quick Replies */}
        <div>
          <h3 className="font-black text-orange-500 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></span>
            Needs Quick Reply ({awaitingInfo.length})
          </h3>

          <div className="space-y-4">
            {awaitingInfo.map(session => (
              <div key={session.id} className="bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-900 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold">{session.extracted_customer_name || 'Unknown'} ({session.customer_phone})</div>
                    <div className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded inline-block mt-1 font-bold">{session.whatsapp_business_number === 'line_1' ? 'Line 1' : 'Line 2'}</div>
                  </div>
                  <div className="text-right text-xs flex flex-col items-end">
                    <div className="text-orange-500 font-bold">Closest car: DRV-03, 4 mins away</div>
                    {session.missing_fields?.length > 0 && (
                      <div className="text-gray-500 mt-1">Missing: {session.missing_fields.join(', ')}</div>
                    )}
                    <button onClick={() => handleDismissSession(session.id)} className="text-red-500 font-bold hover:underline mt-2">Dismiss Chat</button>
                  </div>
                </div>

                {/* Message History preview */}
                <div className="bg-gray-50 dark:bg-black p-3 rounded-lg text-sm mb-3 max-h-40 overflow-y-auto space-y-2">
                  {(messages[session.id] || []).map(msg => (
                    <div key={msg.id} className={`p-2 rounded-lg ${msg.direction === 'inbound' ? 'bg-blue-100 dark:bg-blue-900/40 ml-0 mr-8' : 'bg-green-100 dark:bg-green-900/40 ml-8 mr-0'}`}>
                      {msg.message_type === 'audio' ? (
                        <div>
                          <div className="font-bold text-xs text-blue-600">Voice Note 🎤</div>
                          <audio controls src={msg.audio_media_url || ''} className="h-8 w-full mt-1"></audio>
                          {msg.voice_transcription_ar && <div className="text-xs italic mt-1 border-l-2 border-blue-400 pl-2">{msg.voice_transcription_ar}</div>}
                          {msg.voice_translation_en && <div className="text-xs font-semibold mt-1">{msg.voice_translation_en}</div>}
                        </div>
                      ) : (
                        <div>{msg.raw_text}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replies[session.id] || ''}
                    onChange={e => setReplies({ ...replies, [session.id]: e.target.value })}
                    className="flex-1 border p-2 rounded-lg bg-gray-50 dark:bg-gray-800 outline-none focus:border-orange-500"
                  />
                  <button onClick={() => handleSendReply(session)} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold">Send</button>
                </div>
              </div>
            ))}
            {awaitingInfo.length === 0 && <div className="text-gray-500 italic">No pending questions.</div>}
          </div>
        </div>

        {/* Right Column: Ready for Dispatch */}
        <div>
          <h3 className="font-black text-green-600 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            Ready for Dispatch ({readyForReview.length})
          </h3>

          <div className="space-y-4">
            {readyForReview.map(session => (
              <div key={session.id} className="bg-white dark:bg-gray-900 border border-green-200 dark:border-green-900 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-lg">{session.extracted_customer_name || 'Unknown'}</div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 text-xs font-bold px-2 py-0.5 rounded">
                      AI Confidence: {Math.round((session.ai_confidence_score || 1) * 100)}%
                    </div>
                    <button onClick={() => handleDismissSession(session.id)} className="text-xs text-red-500 font-bold hover:underline">Dismiss</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div className="bg-gray-50 dark:bg-black p-2 rounded">
                    <span className="text-gray-500 text-xs uppercase block font-bold">Pickup</span>
                    {session.extracted_pickup}
                  </div>
                  <div className="bg-gray-50 dark:bg-black p-2 rounded">
                    <span className="text-gray-500 text-xs uppercase block font-bold">Dropoff</span>
                    {session.extracted_destination}
                  </div>
                </div>

                {/* Voice Note check */}
                {(messages[session.id] || []).filter(m => m.message_type === 'audio').map(msg => (
                  <div key={msg.id} className="mb-4 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800">
                    <div className="text-xs font-bold text-blue-600 mb-1">Verify Audio Recording 🎤</div>
                    <audio controls src={msg.audio_media_url || ''} className="h-8 w-full"></audio>
                    <div className="text-xs mt-1">{msg.voice_transcription_ar} / {msg.voice_translation_en}</div>
                  </div>
                ))}

                <button
                  onClick={() => setReviewOrder(session.orders?.[0] || {
                    customer_phone: session.customer_phone,
                    customer_name: session.extracted_customer_name,
                    pickup_address: session.extracted_pickup,
                    destination_address: session.extracted_destination,
                    operator_notes: session.extracted_notes
                  })}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95"
                >
                  Review & Dispatch
                </button>
              </div>
            ))}
            {readyForReview.length === 0 && <div className="text-gray-500 italic">No orders ready for review.</div>}
          </div>
        </div>

      </div>

      {/* Dispatch Modal Overlay */}
      {reviewOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 h-full overflow-y-auto animate-slide-in-right p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Dispatch Order</h2>
              <button onClick={() => setReviewOrder(null)} className="text-gray-500 font-bold text-2xl">&times;</button>
            </div>

            {/* Requirement: Checkbox for WhatsApp notification */}
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800 flex items-start gap-3">
              <input type="checkbox" id="sendWa" defaultChecked className="mt-1 w-5 h-5 text-blue-600" />
              <label htmlFor="sendWa" className="text-sm font-semibold text-blue-900 dark:text-blue-100 cursor-pointer">
                Send WhatsApp confirmation & live ETA to customer automatically upon assignment
              </label>
            </div>

            <OrderEntryForm initialOrder={reviewOrder} onSaved={() => setReviewOrder(null)} />
          </div>
        </div>
      )}

      {/* Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-black text-2xl mb-4">WhatsApp Simulator</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Target Line</label>
                <select value={simLine} onChange={e => setSimLine(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black">
                  <option value="line_1">Line 1 (Main)</option>
                  <option value="line_2">Line 2 (VIP)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Phone</label>
                  <input type="text" value={simPhone} onChange={e => setSimPhone(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Name</label>
                  <input type="text" value={simName} onChange={e => setSimName(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Message Type</label>
                <select value={simType} onChange={e => setSimType(e.target.value)} className="w-full border p-2 rounded bg-gray-50 dark:bg-black">
                  <option value="text">Text</option>
                  <option value="audio">Voice Note (Simulated Bytes)</option>
                  <option value="location">GPS Pin (Simulated coords)</option>
                </select>
              </div>
              {simType !== 'location' && (
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Content</label>
                  <textarea value={simContent} onChange={e => setSimContent(e.target.value)} rows={3} className="w-full border p-2 rounded bg-gray-50 dark:bg-black"></textarea>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowSimulator(false)} className="flex-1 py-3 font-bold bg-gray-200 dark:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSimulate} className="flex-1 py-3 font-bold bg-purple-600 text-white rounded-lg shadow-lg">Send to Webhook</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
