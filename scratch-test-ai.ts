import { GoogleGenAI } from '@google/genai'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    console.log("Initialized AI")
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: "Hello" }] }]
    })
    console.log("Response:", response.text)
  } catch (e) {
    console.error("AI Error:", e)
  }
}

test()
