import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = caminho REAL do dist no repo estático: o vercel.json reescreve
// /admin/* -> /app/dist/index.html e os assets saem como /app/dist/assets/*
// (arquivos estáticos de verdade, sem rewrite — diferente do admin-app antigo).
export default defineConfig({
  plugins: [react()],
  base: '/app/dist/',
  server: { port: 5207, strictPort: true }, // PORTAS.md: 5207 reservada p/ app/
  test: { environment: 'node' },
} as any)
