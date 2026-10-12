/**
 * WhatsApp AI Assistant Entry Point
 * 
 * Delegates to the dedicated WhatsApp Bot Engine (whatsappBotEngine.ts),
 * keeping the bot engine, location detection, pricing calculation,
 * and dispatch pipeline isolated and safe.
 */
import { runWhatsAppBotEngine } from './whatsappBotEngine'

export async function processWhatsAppSessionWithAI(sessionId: string) {
  return await runWhatsAppBotEngine(sessionId)
}

export { runWhatsAppBotEngine }
