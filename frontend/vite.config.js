import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PATHS = [
  '/auth/me', '/auth/logout', '/auth/upgrade', '/auth/profile', '/auth/github',
  '/analyze', '/chat', '/projects', '/inquiries',
  '/stats', '/overview', '/status', '/generate', '/readmes', '/user',
]

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      API_PATHS.map(path => [
        path,
        { target: 'http://localhost:8000', changeOrigin: true, ws: true },
      ])
    ),
  },
})
