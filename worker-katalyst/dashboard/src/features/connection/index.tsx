import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ConnectionInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Connection() {
  const client = useQueryClient()
  const info = useQuery({ queryKey: ['connection'], queryFn: () => api<ConnectionInfo>('connection'), retry: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function verify() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<ConnectionInfo>('connection', 'POST', {})
      client.setQueryData(['connection'], result)
      client.removeQueries({ queryKey: ['scan'] })
      setMessage('Connection verified successfully.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Connection failed.') }
    finally { setBusy(false) }
  }
  return <main id='content' className='mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8'>
    <h1 className='text-3xl font-bold'>Site connection</h1>
    <Card><CardHeader><CardTitle>{info.data?.name ?? 'Katalyst'}</CardTitle>
      <CardDescription>This dashboard is dedicated to one WordPress site.</CardDescription>
    </CardHeader><CardContent className='space-y-4'>
      <p>{info.data?.url ?? 'https://katalyst.tech'}</p>
      <p>{info.data?.configured ? 'The site credential is configured.' : 'Awaiting site setup. Ask your deployment administrator to finish connecting WordPress.'}</p>
      <p className='text-sm text-muted-foreground'>{info.data?.verified_at ? `Last verified: ${new Date(info.data.verified_at).toLocaleString()}` : 'The connection has not been verified yet.'}</p>
      <Button disabled={busy || !info.data?.configured} onClick={() => void verify()}>{busy ? 'Verifying…' : 'Verify connection'}</Button>
      {(error || info.error) && <p className='text-sm text-destructive' role='alert'>{error || info.error?.message}</p>}
      {message && <p className='text-sm' role='status'>{message}</p>}
    </CardContent></Card>
  </main>
}
