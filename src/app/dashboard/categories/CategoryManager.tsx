'use client'

import { useState } from 'react'
import { saveCategory } from './actions'

type Category = any // using any for simplicity since we added dynamic count relation

export default function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories] = useState<Category[]>(initialCategories)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [officePct, setOfficePct] = useState(50)
  const [isCompany, setIsCompany] = useState(false)

  const openNew = () => {
    setEditingId(null)
    setName('')
    setOfficePct(50)
    setIsCompany(false)
    setIsModalOpen(true)
  }

  const openEdit = (c: Category) => {
    setEditingId(c.id)
    setName(c.name)
    setOfficePct(c.default_office_commission_pct)
    setIsCompany(c.is_company_vehicle_category)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await saveCategory({
        id: editingId || undefined,
        name,
        default_office_commission_pct: Number(officePct),
        is_company_vehicle_category: isCompany
      })
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button 
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Create Category
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Category Name</th>
                <th className="px-6 py-4 font-medium">Office %</th>
                <th className="px-6 py-4 font-medium">Driver %</th>
                <th className="px-6 py-4 font-medium">Company Vehicle</th>
                <th className="px-6 py-4 font-medium">Drivers Assigned</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                  <td className="px-6 py-4 text-blue-600 dark:text-blue-400 font-semibold">{c.default_office_commission_pct}%</td>
                  <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">{c.default_driver_commission_pct}%</td>
                  <td className="px-6 py-4">
                    {c.is_company_vehicle_category ? (
                      <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded text-xs font-bold">YES</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-1 rounded text-xs">NO</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {c.drivers?.[0]?.count || 0}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEdit(c)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No categories found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Edit Category' : 'Create Category'}
            </h2>
            
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="e.g. VIP Chauffeur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Office Commission %</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    value={officePct}
                    onChange={e => setOfficePct(Number(e.target.value))}
                    className="w-1/2 px-4 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <div className="w-1/2 text-sm text-gray-500 dark:text-gray-400">
                    Driver gets: <span className="font-bold text-green-600 dark:text-green-400">{100 - officePct}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isCompany"
                  checked={isCompany}
                  onChange={e => setIsCompany(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isCompany" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Uses Company-Owned Vehicle
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
