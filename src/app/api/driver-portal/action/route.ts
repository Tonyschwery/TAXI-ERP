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
        updatePayload.final_fare = Number(final_fare) || 0
        updatePayload.payment_method_code = payment_method_code || 'cash'
        if (extra_charges !== undefined) updatePayload.extra_charges = Number(extra_charges) || 0
        updatePayload.completed_at = new Date().toISOString()
      } else if (status === 'cancelled') {
        updatePayload.operator_notes = cancel_reason ? `Driver Cancelled: ${cancel_reason}` : 'Driver Cancelled'
        updatePayload.cancelled_at = new Date().toISOString()
      }

      const { data: updatedOrder, error } = await supabaseAdmin
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .eq('assigned_driver_id', driver.id) // Security check
        .select()
        .single()

      if (error) throw error

      if (status === 'completed') {
        // Reset driver availability back to available
        await supabaseAdmin.from('drivers').update({ availability: 'available' }).eq('id', driver.id)

        // Insert into financial_transactions to record ledger impact
        if (updatedOrder) {
          const isCash = (updatedOrder.payment_method_code || payment_method_code) === 'cash'
          const txAmount = isCash
            ? Number(updatedOrder.office_share_amount || 0)
            : Number(updatedOrder.driver_share_amount || 0)

          const txType = isCash ? 'trip_commission_debt' : 'trip_payout_credit'
          const balanceEffect = isCash ? -txAmount : txAmount
          const desc = isCash
            ? `Commission owed for Trip #${updatedOrder.order_number}`
            : `Payout credit for Trip #${updatedOrder.order_number} (${updatedOrder.payment_method_code})`

          if (txAmount > 0) {
            await supabaseAdmin.from('financial_transactions').insert([{
              transaction_date: new Date().toISOString(),
              amount: txAmount,
              transaction_type: txType,
              driver_id: driver.id,
              vehicle_id: updatedOrder.assigned_vehicle_id || null,
              order_id: updatedOrder.id,
              description: desc,
              balance_effect_on_driver: balanceEffect,
              payment_method_code: updatedOrder.payment_method_code || payment_method_code || 'cash'
            }])
          }
        }
      } else if (status === 'cancelled') {
        await supabaseAdmin.from('drivers').update({ availability: 'available' }).eq('id', driver.id)
      }

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
