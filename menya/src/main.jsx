import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// With VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set, Menya runs as the
// commercial app (accounts, plans, server-side tutoring). Without them it
// runs in developer mode with the developer's own Groq key. The commercial
// app is a separate chunk so developer mode stays small.
const backendEnabled = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const CommercialApp = lazy(() => import('./commercial/CommercialApp.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {backendEnabled
      ? <Suspense fallback={<div style={{ minHeight: '100vh', background: '#020817' }} />}><CommercialApp /></Suspense>
      : <App />}
  </StrictMode>,
)
