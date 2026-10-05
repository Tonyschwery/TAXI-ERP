import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpensesClient from './ExpensesClient'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator'].includes(role)) {
    redirect('/login')
  }

  // Fetch initial data: vehicles, drivers, expenses, orders (for revenue)
  const { data: vehicles } = await supabase.from('vehicles').select('*').order('plate_number')
  const { data: drivers } = await supabase.from('drivers').select('*').order('full_name')

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-3xl font-black mb-6">Vehicle Expenses & P&L</h1>
      <ExpensesClient vehicles={vehicles || []} drivers={drivers || []} userId={user.id} />
    </div>
  )
}
