import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
import { routeTree } from './routeTree.gen'
import './styles/index.css'
import { AuthGate } from './features/auth'

const queryClient = new QueryClient()
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0 })

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

const rootElement = document.getElementById('root')!
ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><FontProvider><DirectionProvider><AuthGate><RouterProvider router={router} /></AuthGate></DirectionProvider></FontProvider></ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
