import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryManager from './CategoryManager'

export default async function CategoriesPage() {
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

  const { data: categories } = await supabase
    .from('driver_categories')
    .select('*, drivers(count)')
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Driver Categories</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Configure global commission structures and fleet assignments.</p>
      </div>
      <CategoryManager initialCategories={categories || []} />
    </div>
  )
}
