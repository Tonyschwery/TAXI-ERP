'use server'

import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function updateCustomerNotes(customerId: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('customers')
    .update({ notes })
    .eq('id', customerId)

  if (error) throw new Error(error.message)

  await logActivity('customer', customerId, 'customer_notes_updated', { notes })
  revalidatePath('/dashboard/customers')
  
  return { success: true }
}

export async function getCustomerHistory(customerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, created_at, status, pickup_address, destination_address, final_fare, payment_method_code')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw new Error(error.message)
  return data
}

export async function deleteCustomer(customerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Hard delete the customer
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)

  if (error) throw new Error(error.message)

  await logActivity('customer', customerId, 'customer_deleted', {})
  revalidatePath('/dashboard/customers')
  
  return { success: true }
}
