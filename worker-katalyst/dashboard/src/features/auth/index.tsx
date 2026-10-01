import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function AuthGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const client = useQueryClient()
  useEffect(() => {
    const expired = () => { client.clear(); setAuthenticated(false) }
    window.addEventListener('aidb-session-expired', expired)
    void api('session').then(() => setAuthenticated(true)).catch(() => setAuthenticated(false))
    return () => window.removeEventListener('aidb-session-expired', expired)
  }, [client])
  if (authenticated === null) return <p role='status' className='p-8'>Checking your session…</p>
  if (authenticated) return children
  return <main className='grid min-h-svh place-items-center bg-muted/20 p-4'><Card className='w-full max-w-md'><CardHeader><CardTitle>AI Diagnostic Bridge</CardTitle><CardDescription>Sign in to your support workspace.</CardDescription></CardHeader><CardContent><form className='space-y-4' onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await api('login', 'POST', { password }); setPassword(''); setAuthenticated(true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in failed.') }
    finally { setBusy(false) }
  }}><Label htmlFor='access-key'>Dashboard access key</Label><Input id='access-key' type='password' autoComplete='current-password' value={password} onChange={event => setPassword(event.target.value)} required />{error && <p role='alert' className='text-sm text-destructive'>{error}</p>}<Button type='submit' disabled={busy || !password} className='w-full'>{busy ? 'Signing in…' : 'Sign in'}</Button></form></CardContent></Card></main>
}
