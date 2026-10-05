import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()

  try {
    // 1. Check if we already seeded by looking for a specific driver
    const { data: existing } = await supabase.from('drivers').select('id').eq('full_name', 'Demo Ali (Company)').maybeSingle()
    if (existing) {
      return NextResponse.json({ message: 'Demo data already exists.' }, { status: 200 })
    }

    // 2. Create 3 Vehicles
    const vehiclesData = [
      { plate_number: 'B 123456', make: 'Kia', model: 'Cerato', year: 2023, color: 'Silver', status: 'active' },
      { plate_number: 'B 777888', make: 'Hyundai', model: 'Elantra', year: 2022, color: 'White', status: 'active' },
      { plate_number: 'M 999111', make: 'Kia', model: 'Sportage', year: 2024, color: 'Black', status: 'active' }
    ]
    const { data: vList, error: vErr } = await supabase.from('vehicles').insert(vehiclesData).select()
    if (vErr) throw vErr

    // 3. Create 6 Drivers (2 Company, 2 Joker, 2 Office)
    const driversData = [
      { full_name: 'Demo Ali (Company)', driver_code: 'D-101', phone_number: '70111111', driver_category: 'company_car', commission_rate: 50, status: 'active', current_lat: 33.8938, current_lng: 35.5018, current_vehicle_id: vList[0].id },
      { full_name: 'Demo Hassan (Company)', driver_code: 'D-102', phone_number: '70222222', driver_category: 'company_car', commission_rate: 50, status: 'active', current_lat: 33.8869, current_lng: 35.5130, current_vehicle_id: vList[1].id },
      { full_name: 'Demo Omar (Joker)', driver_code: 'D-201', phone_number: '70333333', driver_category: 'joker', commission_rate: 15, status: 'active', current_lat: 33.8719, current_lng: 35.5097 },
      { full_name: 'Demo Ziad (Joker)', driver_code: 'D-202', phone_number: '70444444', driver_category: 'joker', commission_rate: 15, status: 'active', current_lat: 33.8820, current_lng: 35.4946 },
      { full_name: 'Demo Fadi (Office)', driver_code: 'D-301', phone_number: '70555555', driver_category: 'office_driver', commission_rate: 20, status: 'active', current_lat: 33.8968, current_lng: 35.4858 },
      { full_name: 'Demo Sam (Office)', driver_code: 'D-302', phone_number: '70666666', driver_category: 'office_driver', commission_rate: 20, status: 'active', current_lat: 33.8333, current_lng: 35.5333 }
    ]
    const { data: dList, error: dErr } = await supabase.from('drivers').insert(driversData).select()
    if (dErr) throw dErr

    // 4. Create 5 Customers
    const customersData = [
      { full_name: 'Demo Customer 1', phone_number: '03111111', status: 'active', total_trips: 5, lifetime_value: 50 },
      { full_name: 'Demo Customer 2', phone_number: '03222222', status: 'active', total_trips: 12, lifetime_value: 120 },
      { full_name: 'Demo Customer 3', phone_number: '03333333', status: 'active', total_trips: 2, lifetime_value: 20 },
      { full_name: 'Demo Customer 4', phone_number: '03444444', status: 'active', total_trips: 8, lifetime_value: 80 },
      { full_name: 'Demo Customer 5', phone_number: '03555555', status: 'active', total_trips: 1, lifetime_value: 10 }
    ]
    const { data: cList, error: cErr } = await supabase.from('customers').insert(customersData).select()
    if (cErr) throw cErr

    // 5. WhatsApp Thread Sample
    const { data: waThread } = await supabase.from('whatsapp_threads').insert({
      customer_id: cList[0].id,
      phone_number: cList[0].phone_number,
      customer_name: cList[0].full_name,
      status: 'active',
      is_ai_handled: true,
      context_data: { pickup: 'Achrafieh', dropoff: 'Hamra', passengers: 2 }
    }).select().single()

    if (waThread) {
      await supabase.from('whatsapp_messages').insert([
        { thread_id: waThread.id, message_id: 'msg_1', direction: 'inbound', message_type: 'audio', content: 'Marhaba Andrew, kifak, fi sayyara? Baddi rouh men Achrafieh 3a Hamra' },
        { thread_id: waThread.id, message_id: 'msg_2', direction: 'outbound', message_type: 'text', content: 'Ahla bik! Yes we have a car available. It will take 15 mins. The fare is $5. Should I confirm?' },
        { thread_id: waThread.id, message_id: 'msg_3', direction: 'inbound', message_type: 'text', content: 'Eh yalla confirm' }
      ])
    }

    // 6. 10 Completed Trips
    const ordersData = []
    const pm = ['cash', 'credit', 'whish']
    for (let i = 0; i < 10; i++) {
      const drv = dList[i % 6]
      const cust = cList[i % 5]
      const isCompany = drv.driver_category === 'company_car'
      
      const fare = 10 + (i * 2)
      const commissionAmount = fare * (drv.commission_rate / 100)
      const driverShareAmount = fare - commissionAmount
      
      ordersData.push({
        source: 'whatsapp',
        status: 'completed',
        customer_id: cust.id,
        customer_name: cust.full_name,
        customer_phone: cust.phone_number,
        pickup_address: 'Point A',
        destination_address: 'Point B',
        assigned_driver_id: drv.id,
        assigned_vehicle_id: isCompany ? drv.current_vehicle_id : null,
        distance_km: 5 + i,
        estimated_duration_min: 15 + i,
        calculated_fare: fare,
        final_fare: fare,
        payment_method_code: pm[i % 3],
        office_share_amount: commissionAmount,
        driver_share_amount: driverShareAmount
      })
    }
    const { data: oList, error: oErr } = await supabase.from('orders').insert(ordersData).select()
    if (oErr) throw oErr

    // 7. Financial Transactions (Link orders to driver balances)
    const txData = []
    for (let i = 0; i < oList.length; i++) {
      const o = oList[i]
      if (o.payment_method_code === 'cash') {
        // Driver collected cash, owes office the commission
        txData.push({
          transaction_date: o.created_at,
          amount: o.office_share_amount,
          transaction_type: 'trip_commission_debt',
          driver_id: o.assigned_driver_id,
          description: `Commission owed for Trip #${o.order_number}`,
          balance_effect_on_driver: -o.office_share_amount
        })
      } else {
        // Office collected Whish/Credit, owes driver their share
        txData.push({
          transaction_date: o.created_at,
          amount: o.driver_share_amount,
          transaction_type: 'trip_payout_credit',
          driver_id: o.assigned_driver_id,
          description: `Payout credit for Trip #${o.order_number} (${o.payment_method_code})`,
          balance_effect_on_driver: o.driver_share_amount
        })
      }
    }
    await supabase.from('financial_transactions').insert(txData)

    // 8. Vehicle Expenses
    const vExpData = [
      { vehicle_id: vList[0].id, expense_category: 'fuel', amount: 30, expense_date: new Date().toISOString(), paid_by: 'office', description: 'Fill up 95 Octane' },
      { vehicle_id: vList[0].id, expense_category: 'maintenance', amount: 50, expense_date: new Date().toISOString(), paid_by: 'office', description: 'Oil Change' },
      { vehicle_id: vList[1].id, expense_category: 'fuel', amount: 20, expense_date: new Date().toISOString(), paid_by: 'driver', description: 'Fuel paid by driver' },
    ]
    await supabase.from('vehicle_expenses').insert(vExpData)

    return NextResponse.json({ message: 'Demo data seeded successfully!' }, { status: 200 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
