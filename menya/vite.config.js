import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from its own domain (https://menyaneza.com, see public/CNAME),
// so it lives at the root. VITE_BASE overrides it, e.g. '/menya-ai-tutor/' to serve
// from a project path on github.io again.

export default defineConfig({
  plugins: [react()],
  // The tutoring policy lives in ../supabase/functions/_shared and is shared with the backend.
  server: { fs: { allow: ['..'] } },
  base: process.env.VITE_BASE ?? '/',
})
