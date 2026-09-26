import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { api, askExplanation, correctExplanation, getExplanation, regenerateExplanation, scanSite, verifyExplanation, type ConnectionInfo, type Explanation, type ExplanationFields, type Finding, type Post, type Envelope } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarTrigger } from '@/components/ui/sidebar'

type Selection = { post: Post; finding: Finding }
export function Dashboard() {
  const connection = useQuery({ queryKey: ['connection'], queryFn: () => api<ConnectionInfo>('connection'), retry: false })
  const scan = useQuery({ queryKey: ['scan'], queryFn: scanSite, enabled: connection.data?.configured === true, retry: false, staleTime: 300000, refetchOnWindowFocus: false })
  const [selected, setSelected] = useState<Selection | null>(null)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [type, setType] = useState('all')
  const [actionable, setActionable] = useState(false)
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const posts = scan.data?.posts ?? []
  const all = posts.flatMap(post => post.findings.map(finding => ({ post, finding })))
  const filtered = all.filter(({ post, finding }) => `${post.title} ${post.post_id} ${finding.title} ${finding.id}`.toLowerCase().includes(query.toLowerCase()) && (severity === 'all' || finding.severity === severity) && (type === 'all' || post.post_type === type) && (!actionable || finding.severity !== 'info'))
  const counts = new Map<string, number>()
  for (const { finding } of all) counts.set(finding.title, (counts.get(finding.title) ?? 0) + 1)
  const needsAttention = all.some(({ finding }) => finding.severity !== 'info') || scan.data?.site.findings.some(finding => finding.severity !== 'info')
  const stale = scan.data && (clock - Date.parse(scan.data.scannedAt) > 300000 || scan.isError)
  return <main id='content' className='min-h-full space-y-6 bg-muted/20 p-4 md:p-8'>
    <header className='flex flex-wrap items-center justify-between gap-3'><div className='flex items-center gap-3'><SidebarTrigger /><div><p className='text-xs uppercase tracking-widest text-muted-foreground'>Site overview</p><h1 className='text-2xl font-bold'>{connection.data?.name ?? 'Diagnostic workspace'}</h1><p className='text-sm text-muted-foreground'>{connection.data?.url}</p></div></div><Button disabled={!connection.data?.configured || scan.isFetching} onClick={() => void scan.refetch()}><RefreshCw className='mr-2 size-4' />{scan.isFetching ? 'Scanning…' : 'Run scan'}</Button></header>
    {connection.isPending && <p role='status'>Loading site connection…</p>}
    {connection.data && !connection.data.configured && <Card><CardContent className='pt-6'>No site is connected. <Link className='underline' to='/connection'>Connect WordPress</Link> to start a scan.</CardContent></Card>}
    {(connection.error || scan.error) && <p role='alert' className='rounded-lg border border-destructive p-4 text-sm'>{connection.error?.message ?? scan.error?.message} <Link to='/connection' className='underline'>Check site connection</Link>.</p>}
    {scan.isPending && connection.data?.configured && <p role='status'>Reading bounded diagnostic pages from WordPress…</p>}
    {scan.data && <>
      <section className='flex flex-wrap items-center justify-between gap-3'><p className='text-sm text-muted-foreground'>Last successful scan: {new Date(scan.data.scannedAt).toLocaleString()}</p><Badge variant={needsAttention ? 'destructive' : 'secondary'}>{scan.data.incomplete ? 'Incomplete scan' : needsAttention ? 'Warning — findings need review' : 'OK — no actionable findings'}</Badge></section>
      {stale && <p role='status' className='rounded-lg border p-3 text-sm'>These results are stale. Run a scan to refresh the evidence.</p>}
      {scan.data.incomplete && <p role='alert'>Only {posts.length} of {scan.data.total} records were read. Counts below describe this partial scan.</p>}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>{[
        ['Actionable findings', all.filter(x => x.finding.severity !== 'info').length],
        ['Informational findings', all.filter(x => x.finding.severity === 'info').length],
        ['Records without actionable findings', posts.filter(post => post.findings.every(f => f.severity === 'info')).length],
        ['Records scanned', posts.length],
      ].map(([label, value]) => <Card key={label}><CardContent className='pt-6'><p className='text-sm text-muted-foreground'>{label}</p><p className='mt-2 text-3xl font-bold'>{value}</p></CardContent></Card>)}</div>
      <p className='text-sm text-muted-foreground'>{posts.filter(p => p.post_type === 'post').length} Posts · {posts.filter(p => p.post_type === 'page').length} Pages. Findings are deterministic observations; AI explanations are not enabled yet.</p>
      {scan.data.site.findings.length > 0 && <Card><CardHeader><CardTitle>Site-wide observations</CardTitle></CardHeader><CardContent>{scan.data.site.findings.map(finding => <p key={finding.id}>{finding.title} — {finding.severity}: {finding.message}</p>)}</CardContent></Card>}
      <Card><CardHeader><CardTitle>Findings</CardTitle><CardDescription>Search by post/page title, WordPress ID, or finding ID.</CardDescription></CardHeader><CardContent className='space-y-4'><div className='flex flex-wrap gap-3'><Input aria-label='Search findings' className='sm:max-w-sm' value={query} onChange={event => setQuery(event.target.value)} placeholder='Search findings…' /><select aria-label='Severity' className='rounded-md border bg-background px-3 py-2 text-sm' value={severity} onChange={event => setSeverity(event.target.value)}><option value='all'>All severities</option>{['critical', 'high', 'medium', 'low', 'info'].map(value => <option key={value}>{value}</option>)}</select><select aria-label='Post type' className='rounded-md border bg-background px-3 py-2 text-sm' value={type} onChange={event => setType(event.target.value)}><option value='all'>Posts and Pages</option><option value='post'>Posts</option><option value='page'>Pages</option></select><label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={actionable} onChange={event => setActionable(event.target.checked)} />Actionable only</label></div>
      {filtered.length === 0 ? <p className='py-6 text-muted-foreground'>{all.length ? 'No findings match these filters.' : 'No findings were returned for the scanned records.'}</p> : <div className='divide-y'>{filtered.map(({ post, finding }, index) => <button key={`${post.post_id}-${finding.id}-${index}`} className='flex w-full flex-col gap-2 py-4 text-left hover:bg-muted sm:flex-row sm:items-center sm:justify-between' onClick={() => setSelected({ post, finding })}><span><strong className='block text-sm'>{post.title}</strong><span className='block text-xs text-muted-foreground'>{post.post_type} · ID {post.post_id} · {finding.id}</span><span className='block text-sm'>{finding.title}</span></span><Badge variant={['critical', 'high', 'medium'].includes(finding.severity) ? 'destructive' : 'secondary'}>{finding.severity}</Badge></button>)}</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Issue counts</CardTitle></CardHeader><CardContent className='grid gap-2 text-sm sm:grid-cols-2'>{[...counts].sort((a, b) => b[1] - a[1]).map(([title, count]) => <p key={title}>{title}: <strong>{count}</strong></p>)}</CardContent></Card>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className='max-h-[85svh] overflow-y-auto'>{selected && <FindingDetail selected={selected} />}</DialogContent></Dialog>
  </main>
}

function FindingDetail({ selected: { post, finding } }: { selected: Selection }) {
  const detail = useQuery({ queryKey: ['post', post.post_id], queryFn: () => api<Envelope>(`bridge/seo/post/${post.post_id}`), retry: false })
  const explanation = useQuery({ queryKey: ['explanation', finding.id], queryFn: () => getExplanation(finding.id), retry: false })
  const refreshExplanation = () => void explanation.refetch()
  const ask = useMutation({ mutationFn: () => askExplanation(finding, post), onSuccess: refreshExplanation })
  const verify = useMutation({ mutationFn: (note: string) => verifyExplanation(explanation.data?.explanation?.id ?? '', note), onSuccess: refreshExplanation })
  const correct = useMutation({ mutationFn: (input: { fields: ExplanationFields; note: string }) => correctExplanation(explanation.data?.explanation?.id ?? '', input.fields, input.note), onSuccess: refreshExplanation })
  const regenerate = useMutation({ mutationFn: () => regenerateExplanation(explanation.data?.explanation?.id ?? ''), onSuccess: refreshExplanation })
  const current = detail.data?.findings.find(item => item.id === finding.id)
  const shown = current ?? finding
  return <><DialogHeader><DialogTitle>{shown.title}</DialogTitle><DialogDescription>{post.title} · {post.post_type} · WordPress ID {post.post_id}</DialogDescription></DialogHeader><div className='flex gap-2'><Badge>{shown.severity}</Badge><Badge variant='outline'>{shown.category}</Badge></div><p className='text-xs text-muted-foreground'>{shown.id} · Source: {shown.source}</p>{detail.isPending && <p role='status'>Refreshing this record…</p>}{detail.error && <p role='alert'>{detail.error.message} Showing the last scan evidence.</p>}{detail.data && !current && <p role='status'>This finding is no longer present in the latest response. Run a scan to refresh the overview.</p>}<p className='text-sm'>{shown.message}</p><section><h3 className='font-semibold'>Evidence</h3><pre className='mt-2 overflow-auto rounded-md bg-muted p-3 text-xs'>{JSON.stringify(shown.evidence, null, 2)}</pre></section><section className='text-sm'><h3 className='font-semibold'>Next check</h3><p>Open WordPress → {post.post_type === 'post' ? 'Posts' : 'Pages'} → {post.title}. Review this observation in the editor or SEO settings, verify any repair, then run the scan again.</p></section><ExplanationPanel explanation={explanation.data?.explanation ?? null} loading={explanation.isPending} error={explanation.error?.message} onAsk={() => ask.mutate()} asking={ask.isPending} onVerify={note => verify.mutate(note)} verifying={verify.isPending} onCorrect={(fields, note) => correct.mutate({ fields, note })} correcting={correct.isPending} onRegenerate={() => regenerate.mutate()} regenerating={regenerate.isPending} /></>
}

function ExplanationPanel({ explanation, loading, error, onAsk, asking, onVerify, verifying, onCorrect, correcting, onRegenerate, regenerating }: { explanation: Explanation | null; loading: boolean; error?: string; onAsk: () => void; asking: boolean; onVerify: (note: string) => void; verifying: boolean; onCorrect: (fields: ExplanationFields, note: string) => void; correcting: boolean; onRegenerate: () => void; regenerating: boolean }) {
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [fields, setFields] = useState<ExplanationFields | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setFields(explanation?.current_output ?? null); setEditing(false); setShowOriginal(false) }, [explanation?.id, explanation?.updated_at])
  if (loading) return <section className='mt-5 border-t pt-4 text-sm text-muted-foreground'><h3 className='font-semibold text-foreground'>AI explanation</h3><p className='mt-2'>Checking for a saved explanation…</p></section>
  if (error) return <section className='mt-5 border-t pt-4'><h3 className='font-semibold'>AI explanation</h3><p role='alert' className='mt-2 text-sm text-destructive'>{error}</p><Button className='mt-3' variant='outline' onClick={onAsk} disabled={asking}>{asking ? 'Asking AI…' : 'Ask AI to explain this'}</Button></section>
  if (!explanation) return <section className='mt-5 border-t pt-4'><h3 className='font-semibold'>AI explanation</h3><p className='mt-1 text-sm text-muted-foreground'>Nothing is generated automatically.</p><Button className='mt-3' onClick={onAsk} disabled={asking}>{asking ? 'Asking AI…' : 'Ask AI to explain this'}</Button></section>
  const draft = explanation.status === 'draft'
  const output = fields ?? explanation.current_output
  const save = () => { if (fields) onCorrect(fields, note) }
  const copy = () => { void navigator.clipboard?.writeText(Object.values(output).join('\n\n')).then(() => setCopied(true)) }
  return <section className={`mt-5 rounded-lg p-4 ${draft ? 'border-2 border-dashed border-amber-400 bg-amber-50/70 dark:bg-amber-950/20' : 'border bg-muted/30'}`}><div className='flex flex-wrap items-center justify-between gap-2'><h3 className='font-semibold'>{draft ? 'AI-generated interpretation — not yet verified.' : <span className='flex items-center gap-1'>Verified explanation <Check className='size-4 text-emerald-600' /></span>}</h3><Button variant='ghost' size='sm' onClick={onRegenerate} disabled={regenerating}>{regenerating ? 'Regenerating…' : 'Regenerate'}</Button></div>{editing ? <div className='mt-3 space-y-3'>{(Object.keys(output) as (keyof ExplanationFields)[]).map(field => <label className='block text-sm font-medium' key={field}>{field.replace(/_/g, ' ')}<Textarea className='mt-1 font-normal' value={output[field]} onChange={event => setFields({ ...output, [field]: event.target.value })} /></label>)}<label className='block text-sm font-medium'>Reviewer note (optional)<Input className='mt-1 font-normal' value={note} onChange={event => setNote(event.target.value)} placeholder='What did you correct?' /></label><div className='flex gap-2'><Button onClick={save} disabled={correcting || !fields}>{correcting ? 'Saving…' : 'Save correction'}</Button><Button variant='outline' onClick={() => setEditing(false)}>Cancel</Button></div></div> : <div className='mt-3 space-y-3 text-sm'>{(Object.keys(output) as (keyof ExplanationFields)[]).map(field => <div key={field}><p className='font-medium capitalize'>{field.replace(/_/g, ' ')}</p><p>{output[field]}</p></div>)}<label className='block font-medium'>Reviewer note (optional)<Input className='mt-1 font-normal' value={note} onChange={event => setNote(event.target.value)} placeholder='Add a short note' /></label>{draft && <div className='flex flex-wrap gap-2'><Button onClick={() => onVerify(note)} disabled={verifying}>{verifying ? 'Saving…' : 'Yes, this is correct'}</Button><Button variant='outline' onClick={() => setEditing(true)}>No, let me fix it</Button></div>}{!draft && <Button variant='outline' onClick={copy}><Copy className='mr-2 size-4' />{copied ? 'Copied' : 'Copy support reply'}</Button>}<button className='text-xs underline' onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Hide original AI suggestion' : 'View original AI suggestion'}</button>{showOriginal && <pre className='overflow-auto rounded bg-background p-3 text-xs'>{JSON.stringify(explanation.original_output, null, 2)}</pre>}</div>}</section>
}
