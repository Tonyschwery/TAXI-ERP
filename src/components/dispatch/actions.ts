'use server'

import { createClient } from '@/lib/supabase/server'
import { getNearestDrivers } from '@/lib/maps/nearestDriverEngine'
import { calculateRouteAndDistance, searchPlaceAutocomplete } from '@/lib/maps/routingService'
import { logActivity } from '@/lib/audit'
import { normalizePhone } from '@/app/api/customers/lookup/route'

export async function getActiveRulesAndMethods() {
  const supabase = await createClient()
  const { data: rules } = await supabase.from('pricing_rules').select('*').eq('is_active', true)
  const { data: methods } = await supabase.from('payment_methods').select('*').eq('is_active', true)
  return { rules: rules || [], methods: methods || [] }
}

export async function searchPlaces(query: string) {
  return await searchPlaceAutocomplete(query)
}

export async function getPlaceDetails(placeId: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'location'
      }
    });
    const data = await res.json();
    if (data.location) {
      return {
        lat: data.location.latitude,
        lng: data.location.longitude
      };
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export async function lookupCustomer(phone: string) {
  const supabase = await createClient()
  const normalizedPhone = normalizePhone(phone)
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', normalizedPhone)
    .single()
  return customer || null
}

export async function fetchRouteDetails(plat: number, plng: number, dlat: number, dlng: number) {
  return await calculateRouteAndDistance(plat, plng, dlat, dlng)
}

export async function fetchNearestDrivers(plat: number, plng: number, vehicleType: string) {
  return await getNearestDrivers(plat, plng, vehicleType)
}

import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function submitOrder(orderData: any, actionType: 'pending' | 'assign') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let customerId = orderData.customer_id
  const normalizedPhone = normalizePhone(orderData.customer_phone)

  if (!customerId) {
    // Check if customer already exists (e.g. from a previously failed partial submission)
    const { data: existingCust } = await adminSupabase
      .from('customers')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existingCust) {
      customerId = existingCust.id
    } else {
      const { data: newCust, error } = await adminSupabase.from('customers').insert([{
        full_name: orderData.customer_name,
        phone: normalizedPhone
      }]).select().single()
      if (error) throw new Error("Customer error: " + error.message)
      customerId = newCust?.id
    }
  }

  const payload = {
    customer_id: customerId,
    customer_name: orderData.customer_name,
    customer_phone: normalizedPhone,
    source: orderData.order_source || 'phone_call',
    status: actionType === 'assign' ? 'assigned' : 'pending',
    vehicle_type_requested: orderData.vehicle_type,
    pickup_address: orderData.pickup_address,
    pickup_lat: orderData.pickup_lat,
    pickup_lng: orderData.pickup_lng,
    destination_address: orderData.destination_address,
    destination_lat: orderData.destination_lat,
    destination_lng: orderData.destination_lng,
    distance_km: orderData.distance_km,
    estimated_duration_min: orderData.estimated_duration_min,
    calculated_fare: orderData.calculated_fare,
    extra_charges: orderData.extra_charges,
    final_fare: orderData.final_fare,
    payment_method_code: orderData.payment_method_code,
    notes: orderData.operator_notes,
    scheduled_at: orderData.scheduled_time || new Date().toISOString(),
    passengers: 1, // Default to 1
    assigned_driver_id: actionType === 'assign' ? orderData.assigned_driver_id : null
  }

  let orderId = orderData.id
  let orderNumber = orderData.order_number

  if (orderId) {
    const { data, error } = await adminSupabase.from('orders').update(payload).eq('id', orderId).select().single()
    if (error) throw new Error(error.message)
    orderNumber = data.order_number
    await logActivity('order', orderId, 'order_updated', { status: payload.status, assigned_to: payload.assigned_driver_id })
  } else {
    const { data, error } = await adminSupabase.from('orders').insert([payload]).select().single()
    if (error) throw new Error(error.message)
    orderId = data.id
    orderNumber = data.order_number
    await logActivity('order', orderId, 'order_created', { status: payload.status })
  }

  return { success: true, orderId, orderNumber }
}
