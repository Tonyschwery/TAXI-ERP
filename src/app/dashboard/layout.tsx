import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { 
  LayoutDashboard, 
  Car, 
  Users, 
  Map, 
  DollarSign, 
  MessageCircle, 
  FileText,
  Activity,
  PieChart,
  LogOut,
  Settings
} from 'lucide-react'
import { Profile } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const p = profile as Profile | null
  const role = p?.role || 'operator'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex-col hidden md:flex">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white tracking-tight">Taxi Dispatch ERP</h2>
          <p className="text-xs text-gray-400 capitalize mt-1">{role} Portal</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
          {/* Admin & Operator Links */}
          {(role === 'admin' || role === 'operator') && (
            <>
              <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Map className="w-5 h-5" /> Live Dispatch
              </Link>
              <Link href="/dashboard/whatsapp" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <MessageCircle className="w-5 h-5" /> WhatsApp Queue
              </Link>
              <Link href="/dashboard/customers" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Users className="w-5 h-5" /> Customers
              </Link>
              <Link href="/dashboard/expenses" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <DollarSign className="w-5 h-5" /> Expenses & P&L
              </Link>
              <Link href="/dashboard/ledger" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Activity className="w-5 h-5" /> Cashier & Ledger
              </Link>
              <Link href="/dashboard/statements/drivers" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <FileText className="w-5 h-5" /> Driver Statements
              </Link>
              <Link href="/dashboard/statements/vehicles" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <FileText className="w-5 h-5" /> Vehicle Statements
              </Link>
              <Link href="/dashboard/accounting" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <PieChart className="w-5 h-5" /> Accounting Dashboard
              </Link>
            </>
          )}

          {/* Admin & Accounting Links */}
          {(role === 'admin' || role === 'accounting') && (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2 px-3">Accounting</div>
              <Link href="/dashboard/accounting" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <DollarSign className="w-5 h-5" /> Dashboard & Ledger
              </Link>
              <Link href="/dashboard/expenses" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Activity className="w-5 h-5" /> Vehicle Expenses
              </Link>
              <Link href="/dashboard/statements" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <FileText className="w-5 h-5" /> Statements
              </Link>
            </>
          )}

          {/* Admin Only Links */}
          {role === 'admin' && (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2 px-3">System Settings</div>
              <Link href="/dashboard/drivers" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Users className="w-5 h-5" /> Drivers & Categories
              </Link>
              <Link href="/dashboard/vehicles" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Car className="w-5 h-5" /> Vehicles
              </Link>
              <Link href="/dashboard/pricing" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <DollarSign className="w-5 h-5" /> Pricing Rules
              </Link>
              <Link href="/dashboard/staff" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
                <Settings className="w-5 h-5" /> Staff & Logs
              </Link>
            </>
          )}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
             {p?.full_name}
          </div>
          <form action="/auth/signout" method="post">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-sm text-left">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
        {children}
      </main>
    </div>
  )
}
