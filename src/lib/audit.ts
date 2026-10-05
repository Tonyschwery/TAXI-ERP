import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'

type EntityType = Database['public']['Tables']['activity_logs']['Insert']['entity_type']

export async function logActivity(
  entityType: EntityType,
  entityId: string | null,
  action: string,
  details: Record<string, any> = {}
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  await supabase.from('activity_logs').insert({
    actor_id: user.id,
    actor_name: profile?.full_name || 'Unknown',
    entity_type: entityType,
    entity_id: entityId,
    action,
    details
  })
}
