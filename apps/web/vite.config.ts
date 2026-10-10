import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = `http://localhost:${process.env.MOSS_PORT ?? 3000}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Three.js lives in the lazily loaded desktop chunk; the phone never downloads it.
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    // Expose to the LAN so the phone can open the companion in development.
    host: true,
    port: 5173,
    proxy: {
      // xfwd lets the backend tell the laptop apart from the phone behind the proxy.
      '/api': { target: backend, xfwd: true },
      '/ws': { target: backend, ws: true, xfwd: true },
    },
  },
})
