import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PricingManager from './PricingManager'

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: rules } = await supabase.from('pricing_rules').select('*').order('vehicle_type', { ascending: true })
  const { data: paymentMethods } = await supabase.from('payment_methods').select('*').order('code', { ascending: true })

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pricing & Payment Configuration</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage global rate structures and payment settlements.</p>
      </div>
      <PricingManager initialRules={rules || []} initialPaymentMethods={paymentMethods || []} />
    </div>
  )
}
