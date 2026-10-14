import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountingClient from './AccountingClient'

export default async function AccountingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator', 'accounting'].includes(role)) {
    redirect('/login')
  }

  const { data: drivers } = await supabase.from('drivers').select('*').order('full_name')
  const { data: vehicles } = await supabase.from('vehicles').select('*').order('plate_number')

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-3xl font-black mb-6">Accounting & Executive Dashboard</h1>
      <AccountingClient drivers={drivers || []} vehicles={vehicles || []} />
    </div>
  )
}
