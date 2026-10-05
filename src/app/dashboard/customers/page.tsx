import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CustomerManager from './CustomerManager'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'operator'].includes(profile?.role || '')) {
    redirect('/dashboard')
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('last_order_at', { ascending: false, nullsFirst: false })

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Database</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage customer profiles, view trip histories, and set operator notes.</p>
      </div>
      <CustomerManager initialCustomers={customers || []} />
    </div>
  )
}
