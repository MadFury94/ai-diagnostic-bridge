import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

type NavUserProps = { user: { name: string; email: string; avatar: string } }
export function NavUser({ user }: NavUserProps) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  return <div className='space-y-2 p-2'><p className='text-sm font-semibold'>{user.name}</p><Button variant='outline' className='w-full' onClick={async () => {
    try { await api('logout', 'POST'); client.clear(); window.dispatchEvent(new Event('aidb-session-expired')) }
    catch { setError('Sign-out failed. Please try again.') }
  }}>Sign out</Button>{error && <p role='alert' className='text-xs'>{error}</p>}</div>
}
