import { createClient } from '@/lib/supabase/server'
import BookingClient from './BookingClient'

export default async function PublicBookingPage() {
  const supabase = await createClient()

  // Fetch active pricing tiers for the estimation logic
  const { data: tiers } = await supabase.from('pricing_tiers').select('*').eq('is_active', true)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-yellow-400 p-6 text-center">
          <h1 className="text-3xl font-black text-black tracking-tight">Taxi Dispatch</h1>
          <p className="text-black/80 font-bold mt-1">Book your ride in seconds</p>
        </div>
        
        <div className="p-6 md:p-10">
          <BookingClient pricingTiers={tiers || []} />
        </div>
      </div>
    </div>
  )
}
