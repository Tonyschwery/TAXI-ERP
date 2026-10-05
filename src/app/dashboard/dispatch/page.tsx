import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DispatchClient from './DispatchClient'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator'].includes(role)) {
    // If they are a driver or customer, they shouldn't be here. But for now, we'll allow operator fallback.
    redirect('/login')
  }

  // Fetch active, pending, drafts, and recent orders
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300)

  // Fetch active drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('*, driver_categories(name)')
    .eq('is_active', true)

  return (
    <div className="h-[calc(100vh-5rem)]">
      <DispatchClient initialOrders={orders || []} initialDrivers={drivers || []} />
    </div>
  )
}
