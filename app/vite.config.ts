import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = caminho REAL do dist no repo estático: o vercel.json reescreve
// /admin/* -> /app/dist/index.html e os assets saem como /app/dist/assets/*
// (arquivos estáticos de verdade, sem rewrite — diferente do admin-app antigo).
// Só no dev: o vercel.json reescreve /admin/* -> /app/dist/index.html em
// produção, e sem o equivalente aqui o `npm run dev` responde 404 em /admin
// (o router espera /admin, o vite serve a partir do base).
const rewriteAdmin = {
  name: 'rewrite-admin-dev',
  apply: 'serve',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/admin')) req.url = '/app/dist/'
      next()
    })
  },
} as const

export default defineConfig({
  plugins: [react(), rewriteAdmin],
  base: '/app/dist/',
  server: { port: 5207, strictPort: true }, // PORTAS.md: 5207 reservada p/ app/
  test: { environment: 'node' },
} as any)
