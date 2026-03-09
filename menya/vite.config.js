import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️  IMPORTANT: Set this to your GitHub repo name.
// Example: if your repo URL is github.com/happyaxelo.github.io/menya-ai-tutor/
// then set base: '/menya-tutor/'
// If you're deploying to a custom domain or user/org page (yourname.github.io),
// set base: '/'

export default defineConfig({
  plugins: [react()],
  base: '/menya-ai-tutor/',   // <-- change this to your repo name
})
