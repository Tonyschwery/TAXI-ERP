import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import DriverPortalClient from './DriverPortalClient'

export default async function DriverPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Verify token
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('*, driver_categories(name)')
    .eq('secure_access_token', token)
    .single()

  if (!driver) notFound()

  // 2. Fetch today's trips and earnings
  const todayStart = new Date()
  todayStart.setHours(0,0,0,0)

  const { data: todayTrips } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, created_at, status, final_fare, payment_method_code, pickup_address, destination_address')
    .eq('assigned_driver_id', driver.id)
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })

  const completed = todayTrips?.filter(t => t.status === 'completed') || []
  const totalTrips = completed.length
  const totalEarnings = completed.reduce((acc, trip) => acc + (trip.final_fare || 0), 0)

  // 3. Fetch active pricing rules for stops and wait rates
  const { data: pricingRules } = await supabaseAdmin
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)

  return (
    <DriverPortalClient 
      driver={driver} 
      token={token} 
      totalTrips={totalTrips} 
      totalEarnings={totalEarnings} 
      todayTrips={todayTrips || []}
      pricingRules={pricingRules || []}
    />
  )
}
