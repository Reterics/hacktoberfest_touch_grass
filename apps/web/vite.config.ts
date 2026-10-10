import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = `http://localhost:${process.env.MOSS_PORT ?? 3000}`

/**
 * Dev-only endpoint used by the sprite baker (?bake=walk) to save rendered sprite strips.
 * Loopback only, fixed allow-listed filenames, never part of a production build.
 */
function spriteBakeEndpoint(): Plugin {
  const allowed = new Set(['moss-walk', 'moss-hop'])
  return {
    name: 'moss-sprite-bake',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__bake', (req, res) => {
        const name = (req.url ?? '').replace(/^\//, '')
        const remote = req.socket.remoteAddress ?? ''
        if (req.method !== 'POST' || !allowed.has(name) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
          res.statusCode = 403
          return res.end()
        }
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size > 8 * 1024 * 1024) req.destroy()
          else chunks.push(c)
        })
        req.on('end', () => {
          writeFileSync(resolve(__dirname, 'public/assets/moss', `${name}.webp`), Buffer.concat(chunks))
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spriteBakeEndpoint()],
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
