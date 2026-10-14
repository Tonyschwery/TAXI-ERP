'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'

export async function saveDriver(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: Only Admins can modify drivers')
  }

  // Check if driver category represents a company vehicle
  const { data: cat } = await supabase
    .from('driver_categories')
    .select('is_company_vehicle_category, name')
    .eq('id', data.category_id)
    .single()

  const isCompanyCar = cat?.is_company_vehicle_category === true

  let assignedVehicleId = data.assigned_vehicle_id || null

  if (isCompanyCar) {
    const rawDetails = (data.private_vehicle_details || '').trim()
    let makeModel = rawDetails || 'Company Car'
    let plate = `CO-${data.driver_code || Math.floor(100 + Math.random() * 900)}`

    if (rawDetails.includes('/')) {
      const parts = rawDetails.split('/')
      makeModel = parts[0]?.trim() || makeModel
      plate = parts[1]?.trim() || plate
    } else if (rawDetails.includes('-')) {
      const parts = rawDetails.split('-')
      makeModel = parts[0]?.trim() || makeModel
      plate = parts[1]?.trim() || plate
    }

    if (assignedVehicleId) {
      await supabase.from('vehicles').update({
        plate_number: plate,
        make_model: makeModel,
        vehicle_type: data.vehicle_type || 'sedan',
        is_company_owned: true,
        is_active: data.is_active
      }).eq('id', assignedVehicleId)
    } else {
      const { data: existingVeh } = await supabase
        .from('vehicles')
        .select('id')
        .eq('plate_number', plate)
        .maybeSingle()

      if (existingVeh) {
        assignedVehicleId = existingVeh.id
        await supabase.from('vehicles').update({
          make_model: makeModel,
          vehicle_type: data.vehicle_type || 'sedan',
          is_company_owned: true,
          is_active: data.is_active
        }).eq('id', existingVeh.id)
      } else {
        const { data: newVeh } = await supabase.from('vehicles').insert([{
          plate_number: plate,
          make_model: makeModel,
          vehicle_type: data.vehicle_type || 'sedan',
          is_company_owned: true,
          is_active: data.is_active
        }]).select().single()

        if (newVeh) {
          assignedVehicleId = newVeh.id
        }
      }
    }
  } else {
    assignedVehicleId = null
  }

  const payload = {
    driver_code: data.driver_code,
    full_name: data.full_name,
    phone: data.phone,
    category_id: data.category_id,
    assigned_vehicle_id: assignedVehicleId,
    private_vehicle_details: data.private_vehicle_details || null,
    vehicle_type: data.vehicle_type,
    custom_office_pct_override: data.custom_office_pct_override !== '' && data.custom_office_pct_override !== null 
      ? Number(data.custom_office_pct_override) 
      : null,
    is_active: data.is_active,
  }

  if (data.id) {
    const { error, data: updated } = await supabase
      .from('drivers')
      .update(payload)
      .eq('id', data.id)
      .select()
      .single()
      
    if (error) throw new Error(error.message)

    await logActivity('driver', data.id, 'driver_updated', { driver_code: data.driver_code })
  } else {
    const token = crypto.randomBytes(32).toString('hex')
    const insertPayload = {
      ...payload,
      secure_access_token: token,
      availability: 'offline'
    }
    
    const { error, data: inserted } = await supabase
      .from('drivers')
      .insert([insertPayload])
      .select()
      .single()

    if (error) throw new Error(error.message)

    await logActivity('driver', inserted.id, 'driver_created', { driver_code: data.driver_code })
  }

  revalidatePath('/dashboard/drivers')
  return { success: true }
}

export async function regenerateDriverToken(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden')
  }

  const token = crypto.randomBytes(32).toString('hex')
  const { error } = await supabase
    .from('drivers')
    .update({ secure_access_token: token })
    .eq('id', id)
    
  if (error) throw new Error(error.message)

  await logActivity('driver', id, 'driver_token_regenerated', {})
  revalidatePath('/dashboard/drivers')
  return { success: true }
}
