import { useQuery } from '@tanstack/react-query'
import { api, type Finding } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Observation = { source: string; available: boolean; state: null | { status: string; checked_at: number; evidence: Record<string, unknown> }; finding: Finding | null }
type Operations = { enabled: boolean; observations: Observation[] }
const names: Record<string, string> = { database_log: 'Database errors', wp_cron: 'WordPress scheduled events', action_scheduler: 'Action Scheduler tasks' }

export function OperationalChecks() {
  const result = useQuery({ queryKey: ['operations'], queryFn: () => api<Operations>('operations'), refetchInterval: 60000, retry: false })
  return <Card>
    <CardHeader><CardTitle>Database and scheduler monitoring</CardTitle><CardDescription>Checks every five minutes, independently of the hourly full scan. Overdue work must remain unchanged for 15 minutes before a scheduler alert.</CardDescription></CardHeader>
    <CardContent className='space-y-4 text-sm'>
      {result.isPending && <p role='status'>Loading monitoring evidence...</p>}
      {result.error && <p role='alert'>Monitoring evidence could not be loaded. This does not mean the checks passed.</p>}
      {result.data?.enabled === false && <p>Operational monitoring is not enabled for this site.</p>}
      {result.data?.observations.map(item => <section className='space-y-1 rounded-md border p-3' key={item.source}>
        <div className='flex flex-wrap justify-between gap-2'><strong>{names[item.source] ?? item.source}</strong><Badge variant={item.available && item.finding ? 'destructive' : 'secondary'}>{!item.available ? 'Evidence unavailable' : item.finding ? 'Needs attention' : item.state?.status === 'observing' ? 'Watching overdue work' : 'No current matching finding'}</Badge></div>
        {item.state && <p className='text-xs text-muted-foreground'>Last check window: {new Date(item.state.checked_at).toLocaleString()}</p>}
        {!item.available && <p>{item.source === 'database_log' ? 'Current log evidence is unavailable or incomplete. The WordPress plugin needs access to a configured readable log; missing evidence does not establish a healthy database.' : 'Current scheduler evidence is unavailable or stale. An earlier problem is not confirmed cleared.'}</p>}
        {item.available && item.finding && <><p>{item.finding.title}</p><p>{item.finding.message}</p></>}
        {item.available && item.state?.status === 'observing' && <p>An overdue item is being observed. This alone does not prove that the scheduler has stopped.</p>}
        {item.available && item.state && <p className='text-xs text-muted-foreground'>{item.source === 'database_log' ? `Matching errors in the bounded 15-minute log window: ${item.state.evidence.count ?? 0}.` : `Overdue items observed: ${item.state.evidence.count ?? 0}${item.state.evidence.truncated ? ' (limited sample)' : ''}.`}</p>}
      </section>)}
      <p className='text-xs text-muted-foreground'>These observations do not prove database integrity, identify the root cause, or verify checkout. If WordPress cannot respond, internal evidence may be unavailable while the separate homepage monitor still detects an outage.</p>
    </CardContent>
  </Card>
}
