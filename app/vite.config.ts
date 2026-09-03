import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

// Identidade da versão mostrada em Configurações → Sistema.
// Só entra coisa determinística a partir do conteúdo do repo: hash de app/src,
// última migração, registro de deploy das edges. NUNCA commit hash nem data de
// build — mudariam o dist a cada commit e o `release:check` (que compara o
// dist commitado com um build fresco) falharia com árvore limpa.
function hashDir(dir: string): string {
  const h = createHash('sha1')
  const andar = (d: string) => {
    for (const nome of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, nome.name)
      if (nome.isDirectory()) andar(p)
      else { h.update(p); h.update(readFileSync(p)) }
    }
  }
  andar(dir)
  return h.digest('hex')
}
const migracoes = readdirSync('../database/migrations').filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.sql$/.test(f)).sort()
const versao = {
  fonte: hashDir('src').slice(0, 8),
  migracao: migracoes.at(-1) ?? null,
}
const edges = JSON.parse(readFileSync('../edge-functions/DEPLOYS.json', 'utf8')).edges

export default defineConfig({
  plugins: [react(), rewriteAdmin],
  base: '/app/dist/',
  define: { __VERSAO__: JSON.stringify(versao), __EDGES__: JSON.stringify(edges) },
  server: { port: 5207, strictPort: true }, // PORTAS.md: 5207 reservada p/ app/
  test: { environment: 'node' },
} as any)
