import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'


export async function POST(req: Request) {
  try {
    const { token, action, data } = await req.json()
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify driver via token
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .eq('secure_access_token', token)
      .single()

    if (!driver) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    if (action === 'toggle_availability') {
      const updateData: any = { availability: data.availability }
      // Start the heartbeat clock the exact moment they go online
      if (data.availability === 'available') {
        updateData.last_gps_update = new Date().toISOString()
      }

      const { error } = await supabaseAdmin
        .from('drivers')
        .update(updateData)
        .eq('id', driver.id)
      
      if (error) throw error
      await supabaseAdmin.from('activity_logs').insert([{
        entity_type: 'driver',
        entity_id: driver.id,
        action: 'availability_changed',
        details: { to: data.availability },
        user_id: null // Driver action
      }])
      return NextResponse.json({ success: true })
    }

    if (action === 'update_location') {
      await supabaseAdmin
        .from('drivers')
        .update({ current_lat: data.lat, current_lng: data.lng, last_gps_update: new Date().toISOString() })
        .eq('id', driver.id)
      return NextResponse.json({ success: true })
    }

    if (action === 'update_order_status') {
      const { orderId, status, final_fare, payment_method_code, extra_charges, cancel_reason } = data
      
      const updatePayload: any = { status }
      if (status === 'completed') {
        updatePayload.final_fare = final_fare
        updatePayload.payment_method_code = payment_method_code
        if (extra_charges !== undefined) updatePayload.extra_charges = extra_charges
      } else if (status === 'cancelled') {
        updatePayload.operator_notes = cancel_reason ? `Driver Cancelled: ${cancel_reason}` : 'Driver Cancelled'
      }

      const { error } = await supabaseAdmin
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .eq('assigned_driver_id', driver.id) // Security check

      if (error) throw error
      await supabaseAdmin.from('activity_logs').insert([{
        entity_type: 'order',
        entity_id: orderId,
        action: `driver_status_${status}`,
        details: { driver_id: driver.id },
        user_id: null
      }])
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
