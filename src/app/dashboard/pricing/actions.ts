'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function savePricingRule(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')

  const payload = {
    name: data.name,
    vehicle_type: data.vehicle_type,
    base_fare: Number(data.base_fare),
    price_per_km: Number(data.price_per_km),
    minimum_fare: Number(data.minimum_fare),
    night_multiplier: Number(data.night_multiplier),
    night_start_hour: Number(data.night_start_hour),
    night_end_hour: Number(data.night_end_hour),
    extra_stop_fee: Number(data.extra_stop_fee),
    waiting_fee_per_15min: Number(data.waiting_fee_per_15min),
    is_active: data.is_active,
    updated_at: new Date().toISOString()
  }

  if (data.id) {
    const { error } = await supabase.from('pricing_rules').update(payload).eq('id', data.id)
    if (error) throw new Error(error.message)
    await logActivity('system', data.id, 'pricing_rule_updated', { vehicle_type: data.vehicle_type })
  } else {
    const { error, data: inserted } = await supabase.from('pricing_rules').insert([payload]).select().single()
    if (error) throw new Error(error.message)
    await logActivity('system', inserted.id, 'pricing_rule_created', { vehicle_type: data.vehicle_type })
  }

  revalidatePath('/dashboard/pricing')
  return { success: true }
}

export async function deletePricingRule(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')

  const { error } = await supabase.from('pricing_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)

  await logActivity('system', id, 'pricing_rule_deleted', { rule_id: id })
  revalidatePath('/dashboard/pricing')
  return { success: true }
}

export async function savePaymentMethod(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')

  const payload = {
    code: data.code,
    display_name: data.display_name,
    settlement_type: data.settlement_type,
    is_active: data.is_active
  }

  if (data.id) {
    const { error } = await supabase.from('payment_methods').update(payload).eq('id', data.id)
    if (error) throw new Error(error.message)
    await logActivity('system', data.id, 'payment_method_updated', { code: data.code })
  } else {
    const { error, data: inserted } = await supabase.from('payment_methods').insert([payload]).select().single()
    if (error) throw new Error(error.message)
    await logActivity('system', inserted.id, 'payment_method_created', { code: data.code })
  }

  revalidatePath('/dashboard/pricing')
  return { success: true }
}
