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

  const payload = {
    driver_code: data.driver_code,
    full_name: data.full_name,
    phone: data.phone,
    category_id: data.category_id,
    assigned_vehicle_id: data.assigned_vehicle_id || null,
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
