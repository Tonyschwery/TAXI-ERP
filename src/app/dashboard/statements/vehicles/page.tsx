import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VehicleStatementsClient from './VehicleStatementsClient'

export default async function VehicleStatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator'].includes(role)) {
    redirect('/login')
  }

  const { data: vehicles } = await supabase.from('vehicles').select('*').order('plate_number')

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-3xl font-black mb-6">Company Vehicle Statements</h1>
      <VehicleStatementsClient vehicles={vehicles || []} />
    </div>
  )
}
