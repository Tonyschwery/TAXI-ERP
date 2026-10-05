import { redirect } from 'next/navigation'

export default function DashboardIndex() {
  // By default, redirect operators to the live dispatch map
  redirect('/dashboard/dispatch')
}
