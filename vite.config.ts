import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { routeApiRequest, toApiErrorResponse } from './src/cli/web-server'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    {
      name: 'image-sprout-local-bridge',
      configureServer(server) {
        server.middlewares.use('/api', async (req, res) => {
          try {
            const body =
              req.method === 'GET' || req.method === 'HEAD'
                ? {}
                : await new Promise<unknown>((resolve, reject) => {
                    const chunks: Buffer[] = []
                    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
                    req.on('end', () => {
                      if (chunks.length === 0) {
                        resolve({})
                        return
                      }
                      try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
                      } catch (error) {
                        reject(error)
                      }
                    })
                    req.on('error', reject)
                  })

            const response = await routeApiRequest(
              req.method ?? 'GET',
              `/api${req.url ?? ''}`,
              body,
            )
            res.statusCode = response.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response.payload))
          } catch (error) {
            const response = toApiErrorResponse(error)
            res.statusCode = response.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response.payload))
          }
        })
      },
    },
  ],
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
  },
})
