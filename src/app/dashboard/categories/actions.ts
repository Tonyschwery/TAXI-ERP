'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function saveCategory(data: {
  id?: string;
  name: string;
  default_office_commission_pct: number;
  is_company_vehicle_category: boolean;
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
    throw new Error('Forbidden: Only Admins can modify categories')
  }

  const payload = {
    name: data.name,
    default_office_commission_pct: data.default_office_commission_pct,
    default_driver_commission_pct: 100 - data.default_office_commission_pct,
    is_company_vehicle_category: data.is_company_vehicle_category,
    is_active: true
  }

  if (data.id) {
    const { error, data: updated } = await supabase
      .from('driver_categories')
      .update(payload)
      .eq('id', data.id)
      .select()
      .single()
      
    if (error) throw new Error(error.message)

    await logActivity('driver', data.id, 'category_updated', {
      name: data.name,
      new_office_pct: data.default_office_commission_pct
    })
    
  } else {
    const { error, data: inserted } = await supabase
      .from('driver_categories')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error(error.message)

    await logActivity('driver', inserted.id, 'category_created', {
      name: data.name,
      office_pct: data.default_office_commission_pct
    })
  }

  revalidatePath('/dashboard/categories')
  return { success: true }
}
