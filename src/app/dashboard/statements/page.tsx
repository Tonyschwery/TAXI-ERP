import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Users, Car, ArrowRight } from 'lucide-react'

export default async function StatementsHubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'operator'
  if (!['admin', 'operator', 'accounting'].includes(role)) {
    redirect('/login')
  }

  const { count: driverCount } = await supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: vehicleCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('is_active', true)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
          <FileText className="w-8 h-8 text-blue-600" />
          Financial Statements & Settlements
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Generate, review, and export itemized financial statements for drivers and company fleet vehicles.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Driver Statements Card */}
        <Link 
          href="/dashboard/statements/drivers" 
          className="group p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
              Driver Statements & Payouts
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              Reconcile completed trips, gross fares, office commissions, cash collected, and driver net pay. Export itemized driver statements to PDF, Excel, and CSV.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {driverCount || 0} Active Drivers
            </span>
            <span className="text-sm font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Open Driver Statements <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </Link>

        {/* Vehicle Statements Card */}
        <Link 
          href="/dashboard/statements/vehicles" 
          className="group p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl hover:border-purple-500 hover:shadow-lg transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Car className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-purple-600 transition-colors">
              Company Vehicle Statements
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              Track vehicle revenue versus fuel and maintenance expenses. Analyze net profitability per vehicle and download official settlement reports.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {vehicleCount || 0} Fleet Vehicles
            </span>
            <span className="text-sm font-bold text-purple-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Open Vehicle Statements <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </Link>
      </div>
    </div>
  )
}
