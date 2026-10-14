import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ExpensesClient from './ExpensesClient'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator', 'accounting'].includes(role)) {
    redirect('/login')
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch only company-owned fleet vehicles with their assigned drivers
  const { data: vehicles } = await adminClient
    .from('vehicles')
    .select('*, drivers:drivers(id, full_name, driver_code)')
    .eq('is_company_owned', true)
    .eq('is_active', true)
    .order('plate_number')

  const { data: drivers } = await adminClient
    .from('drivers')
    .select('id, full_name, driver_code, assigned_vehicle_id, category_id, driver_categories(name, is_company_vehicle_category)')
    .eq('is_active', true)
    .order('full_name')

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-3xl font-black mb-6">Company Vehicle Expenses & P&L</h1>
      <ExpensesClient vehicles={vehicles || []} drivers={drivers || []} userId={user.id} />
    </div>
  )
}
