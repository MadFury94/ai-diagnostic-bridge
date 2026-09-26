import { AlertTriangle, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Brian',
    email: 'Support workspace',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Anbe Nigeria',
      logo: ShieldCheck,
      plan: 'AI Diagnostic Bridge',
    },
  ],
  navGroups: [
    {
      title: 'Workspace',
      items: [
        { title: 'Overview', url: '/', icon: LayoutDashboard },
        { title: 'Findings', url: '/findings', icon: AlertTriangle },
        { title: 'Site connection', url: '/connection', icon: Settings },
      ],
    },
  ],
}
