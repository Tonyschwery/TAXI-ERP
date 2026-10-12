import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { token, lat, lng } = await req.json()
    if (!token || lat === undefined || lat === null || lng === undefined || lng === null) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return NextResponse.json({ error: 'Invalid coordinate numbers' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify driver via token
    const { data: driver, error: driverErr } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, driver_code')
      .eq('secure_access_token', token)
      .single()

    if (driverErr || !driver) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Update GPS location and last_gps_update timestamp
    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('drivers')
      .update({ 
        current_lat: parsedLat, 
        current_lng: parsedLng, 
        last_gps_update: nowIso 
      })
      .eq('id', driver.id)

    if (updateError) {
      console.error('[driver-gps] Error updating driver location:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      driver_id: driver.id,
      driver_code: driver.driver_code,
      lat: parsedLat, 
      lng: parsedLng, 
      last_gps_update: nowIso 
    })

  } catch (err: any) {
    console.error('[driver-gps] Unexpected error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

