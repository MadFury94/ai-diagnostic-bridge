import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ConnectionInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Connection() {
  const client = useQueryClient()
  const info = useQuery({ queryKey: ['connection'], queryFn: () => api<ConnectionInfo>('connection'), retry: false })
  const [name, setName] = useState('Anbe Nigeria')
  const [url, setUrl] = useState('https://anbenigeria.com')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function perform(method: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<ConnectionInfo>('connection', method, method === 'PUT' ? { name, url, token } : {})
      client.setQueryData(['connection'], result)
      client.removeQueries({ queryKey: ['scan'] })
      setMessage(method === 'DELETE' ? 'Connection removed from this dashboard.' : 'Connection verified successfully.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Connection failed.') }
    finally { setToken(''); setBusy(false) }
  }
  return <main id='content' className='mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8'><h1 className='text-3xl font-bold'>Site connection</h1><Card><CardHeader><CardTitle>WordPress diagnostic bridge</CardTitle><CardDescription>{info.data?.configured ? `${info.data.name} is configured. Last verified: ${new Date(info.data.verified_at!).toLocaleString()}` : 'Connect Anbe Nigeria to start reading diagnostic evidence.'}</CardDescription></CardHeader><CardContent><form className='space-y-5' onSubmit={event => { event.preventDefault(); void perform('PUT') }}><div className='space-y-2'><Label htmlFor='site-name'>Site name</Label><Input id='site-name' value={name} onChange={event => setName(event.target.value)} maxLength={100} required /></div><div className='space-y-2'><Label htmlFor='site-url'>WordPress site URL</Label><Input id='site-url' type='url' value={url} onChange={event => setUrl(event.target.value)} required /></div><div className='space-y-2'><Label htmlFor='token'>{info.data?.configured ? 'Replacement diagnostic token' : 'Diagnostic token'}</Label><Input id='token' type='password' autoComplete='off' value={token} onChange={event => setToken(event.target.value)} placeholder='Paste the WordPress bridge token' minLength={32} maxLength={512} required /><p className='text-sm text-muted-foreground'>The token is encrypted on the server and is never returned to the browser. This field clears after each attempt.</p></div><div className='flex flex-wrap gap-3'><Button type='submit' disabled={busy || !token}>{busy ? 'Working…' : 'Save and test connection'}</Button>{info.data?.configured && <Button type='button' variant='outline' disabled={busy} onClick={() => void perform('POST')}>Test saved connection</Button>}</div></form>{(error || info.error) && <p className='mt-4 text-sm text-destructive' role='alert'>{error || info.error?.message}</p>}{message && <p className='mt-4 text-sm' role='status'>{message}</p>}{info.data?.configured && <details className='mt-6 text-sm'><summary className='cursor-pointer'>Disconnect this site</summary><p className='my-3 text-muted-foreground'>Removes the saved credential from this dashboard. To revoke the token itself, use WordPress → Settings → AI Diagnostic Bridge.</p><Button variant='destructive' disabled={busy} onClick={() => void perform('DELETE')}>Remove saved connection</Button></details>}</CardContent></Card></main>
}
