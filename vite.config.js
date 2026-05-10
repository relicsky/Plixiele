import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FN_BASE = 'http://127.0.0.1:5001/plixiele-sign-in/us-central1'

export default defineConfig({
  plugins: [react()],
  define: { 'process.env': {} },
  server: {
    proxy: {
      '/api/anthropic': {
        target: `${FN_BASE}/anthropicProxy`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/gemini': {
        target: `${FN_BASE}/geminiProxy`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/bootstrap': {
        target: `${FN_BASE}/bootstrapProfile`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/weapon': {
        target: `${FN_BASE}/generateWeapon`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/roblox': {
        target: `${FN_BASE}/generateRoblox`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/keys/revoke': {
        target: `${FN_BASE}/revokeApiKey`,
        changeOrigin: true,
        rewrite: () => '',
      },
      '/api/keys': {
        target: `${FN_BASE}/createApiKey`,
        changeOrigin: true,
        rewrite: () => '',
      },
    },
  },
})
