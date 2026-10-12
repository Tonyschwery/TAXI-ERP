import crypto from 'crypto'

/**
 * Helper client to send outbound WhatsApp messages via Meta Cloud API.
 */

export async function sendWhatsAppMessage(
  lineIdentifier: 'line_1' | 'line_2',
  recipientPhone: string,
  text: string
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new Error('Missing WHATSAPP_ACCESS_TOKEN')

  let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_LINE_1
  if (lineIdentifier === 'line_2') {
    phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_LINE_2
  }

  if (!phoneNumberId) throw new Error(`Missing WHATSAPP_PHONE_NUMBER_ID for ${lineIdentifier}`)

  // Strip leading '+' if present for WhatsApp API
  const to = recipientPhone.replace('+', '')

  let url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const proof = crypto.createHmac('sha256', appSecret).update(token).digest('hex')
    url += `?appsecret_proof=${proof}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        preview_url: true,
        body: text
      }
    })
  })

  const result = await response.json()

  if (!response.ok) {
    console.error('WhatsApp API Error:', result)
    throw new Error(result.error?.message || 'Failed to send WhatsApp message')
  }

  return result
}
