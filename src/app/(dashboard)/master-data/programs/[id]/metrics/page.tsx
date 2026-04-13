import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { MetricsClient } from './metrics-client'

export const dynamic = 'force-dynamic'

export default async function ProgramMetricsPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch program
  const { data: program } = await supabase
    .from('programs')
    .select('id, name, department, target_type')
    .eq('id', params.id)
    .single()

  if (!program) notFound()

  // Fetch existing metric definitions
  const { data: metrics } = await supabase
    .from('program_metric_definitions')
    .select('*')
    .eq('program_id', params.id)
    .order('display_order', { ascending: true })

  return (
    <MetricsClient
      program={program}
      initialMetrics={metrics || []}
    />
  )
}
