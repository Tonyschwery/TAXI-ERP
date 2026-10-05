import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatementsClient from './StatementsClient'

export default async function DriverStatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator'].includes(role)) {
    redirect('/login')
  }

  const { data: drivers } = await supabase.from('drivers').select('*').order('full_name')

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-3xl font-black mb-6">Driver Accounting & Statements</h1>
      <StatementsClient drivers={drivers || []} />
    </div>
  )
}
