/// <reference types="vite/client" />

// Injetados em build pelo `define` de vite.config.ts. Ver comentário lá sobre
// por que só entra dado determinístico (nada de commit hash nem data).
declare const __VERSAO__: { fonte: string; migracao: string | null }
declare const __EDGES__: Record<string, { commit: string; em: string }>
