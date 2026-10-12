import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DriverManager from './DriverManager'

export default async function DriversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: drivers } = await supabase
    .from('drivers')
    .select(`
      *,
      driver_categories:category_id(*),
      vehicles:assigned_vehicle_id(*)
    `)
    .order('created_at', { ascending: false })

  const { data: categories } = await supabase
    .from('driver_categories')
    .select('id, name, default_office_commission_pct')
    .eq('is_active', true)
    .order('name')

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, plate_number, make_model, custom_company_pct')
    .eq('is_active', true)
    .order('plate_number')

  // Get APP_URL from env or fallback to production URL
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://taxi-erp.vercel.app').replace(/\/$/, '')

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Driver Management</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage driver profiles, assign vehicles, and generate access portals.</p>
      </div>
      <DriverManager 
        initialDrivers={drivers || []} 
        categories={categories || []}
        vehicles={vehicles || []}
        appUrl={appUrl}
      />
    </div>
  )
}
