import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// With VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set, Menya runs as the
// commercial app (accounts, plans, server-side tutoring). Without them it
// runs in developer mode with the developer's own Groq key. The commercial
// app is a separate chunk so developer mode stays small.
const backendEnabled = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
// The bring-your-own-key developer mode exists only for local development.
// A production build without a backend shows a setup notice instead, so
// students never see an API-key form.
const developerMode = import.meta.env.DEV || import.meta.env.VITE_ALLOW_BYOK === 'true'
const CommercialApp = lazy(() => import('./commercial/CommercialApp.jsx'))

function NotConfigured() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050a17', color: '#e8eef8', fontFamily: 'system-ui, sans-serif', padding: 16, textAlign: 'center' }}>
      <div><h1 style={{ fontSize: 22, marginBottom: 8 }}>Menya AI Tutor is being set up</h1><p style={{ color: '#8494ad' }}>Please check back soon.</p></div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {backendEnabled
      ? <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050a17' }} />}><CommercialApp /></Suspense>
      : developerMode ? <App /> : <NotConfigured />}
  </StrictMode>,
)
