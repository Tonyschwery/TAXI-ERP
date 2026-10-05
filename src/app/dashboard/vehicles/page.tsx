import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VehicleManager from './VehicleManager'

export default async function VehiclesPage() {
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

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*, drivers(id, full_name, is_active)')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fleet Management</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage company-owned and external vehicles in the fleet.</p>
      </div>
      <VehicleManager initialVehicles={vehicles || []} />
    </div>
  )
}
