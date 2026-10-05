'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function saveVehicle(data: {
  id?: string;
  plate_number: string;
  make_model: string;
  year: number | null;
  color: string | null;
  vehicle_type: string;
  is_company_owned: boolean;
  custom_company_pct: number | null;
  notes: string | null;
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: Only Admins can modify vehicles')
  }

  const custom_driver_pct = data.custom_company_pct !== null ? 100 - data.custom_company_pct : null;

  const payload = {
    plate_number: data.plate_number,
    make_model: data.make_model,
    year: data.year,
    color: data.color,
    vehicle_type: data.vehicle_type,
    is_company_owned: data.is_company_owned,
    custom_company_pct: data.custom_company_pct,
    custom_driver_pct: custom_driver_pct,
    notes: data.notes,
    is_active: true
  }

  if (data.id) {
    const { error, data: updated } = await supabase
      .from('vehicles')
      .update(payload)
      .eq('id', data.id)
      .select()
      .single()
      
    if (error) throw new Error(error.message)

    await logActivity('vehicle', data.id, 'vehicle_updated', {
      plate_number: data.plate_number,
      make_model: data.make_model
    })
    
  } else {
    const { error, data: inserted } = await supabase
      .from('vehicles')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error(error.message)

    await logActivity('vehicle', inserted.id, 'vehicle_created', {
      plate_number: data.plate_number,
      make_model: data.make_model
    })
  }

  revalidatePath('/dashboard/vehicles')
  return { success: true }
}
