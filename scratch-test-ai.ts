import { GoogleGenAI } from '@google/genai'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const list = ['gemini-3.5-flash']
    for (const model of list) {
      try {
        console.log(`Testing ${model}...`)
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: "Respond: OK from 3.5 flash" }] }]
        })
        console.log(`✅ Success for ${model}:`, res.text?.trim())
        break
      } catch (err: any) {
        console.log(`❌ Failed for ${model}:`, err.message?.slice(0, 100))
      }
    }
  } catch (e) {
    console.error("AI Error:", e)
  }
}

test()
