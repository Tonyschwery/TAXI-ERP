import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Optional: Vercel Cron security check (if CRON_SECRET is defined in Vercel)
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  // Calculate cutoff: 15 minutes ago
  const cutoff = new Date(Date.now() - 15 * 60000).toISOString()

  try {
    // 1. Fetch drivers that need to be swept to log their activity
    const { data: ghostDrivers } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('availability', 'available')
      .lt('last_gps_update', cutoff)

    if (ghostDrivers && ghostDrivers.length > 0) {
      // 2. Mark them offline
      const { error } = await supabaseAdmin
        .from('drivers')
        .update({ availability: 'offline' })
        .eq('availability', 'available')
        .lt('last_gps_update', cutoff)

      if (error) throw error

      // 3. Log the system action for the audit trail
      const logs = ghostDrivers.map(d => ({
        entity_type: 'driver',
        entity_id: d.id,
        action: 'availability_changed',
        details: { to: 'offline', reason: 'system_auto_sweep_timeout' },
        user_id: null
      }))
      
      await supabaseAdmin.from('activity_logs').insert(logs)
      
      return NextResponse.json({ 
        success: true, 
        sweptCount: ghostDrivers.length,
        message: `Successfully swept ${ghostDrivers.length} ghost drivers.` 
      })
    }

    return NextResponse.json({ success: true, sweptCount: 0, message: 'No ghost drivers found.' })

  } catch (error: any) {
    console.error('Sweeper Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
