import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `langgraph dev` serves the graph on :2024. Proxying it keeps the browser on one
// origin, so no CORS setup is needed and the SSE run stream passes straight through.
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL ?? 'http://localhost:2024'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: LANGGRAPH_API_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // The desk imports journalist ids and profiles from ../src so they stay in one place.
    fs: { allow: ['..'] },
  },
})
