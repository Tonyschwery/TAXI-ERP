import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { token, lat, lng } = await req.json()
    if (!token || !lat || !lng) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify driver via token
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('secure_access_token', token)
      .single()

    if (!driver) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    // Update GPS
    await supabaseAdmin
      .from('drivers')
      .update({ 
        current_lat: lat, 
        current_lng: lng, 
        last_ping_at: new Date().toISOString() 
      })
      .eq('id', driver.id)

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
