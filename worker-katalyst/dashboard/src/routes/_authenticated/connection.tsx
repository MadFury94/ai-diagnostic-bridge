import { createFileRoute } from '@tanstack/react-router'
import { Connection } from '@/features/connection'

export const Route = createFileRoute('/_authenticated/connection')({
  component: Connection,
})
