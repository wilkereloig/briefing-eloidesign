// scripts/deploy-edges.mjs — deploy de edge functions A PARTIR DO REPO.
// Motivo de existir: em 2026-07-27 produção estava à frente do repo e um
// diagnóstico inteiro saiu errado. Regra: dashboard NUNCA; só este script.
// Uso:  node scripts/deploy-edges.mjs eloi-gestao [outra...] [--dry-run]
// Env:  SUPABASE_ACCESS_TOKEN (dashboard → Account → Access Tokens)
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const PROJECT = 'nlamznxoocmygfvnqcns'
const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const fns = args.filter(a => a !== '--dry-run')
if (!fns.length) { console.error('uso: node scripts/deploy-edges.mjs <fn...> [--dry-run]'); process.exit(1) }

const STAGE = '.deploy-edges'
rmSync(STAGE, { recursive: true, force: true })
for (const fn of fns) {
  const src = `edge-functions/${fn}.ts`
  if (!existsSync(src)) { console.error(`não existe: ${src}`); process.exit(1) }
  mkdirSync(`${STAGE}/supabase/functions/${fn}`, { recursive: true })
  // CLI espera functions/<fn>/index.ts; imports ./_shared/ viram ../_shared/
  writeFileSync(`${STAGE}/supabase/functions/${fn}/index.ts`,
    readFileSync(src, 'utf8').replaceAll('./_shared/', '../_shared/'))
}
if (existsSync('edge-functions/_shared'))
  cpSync('edge-functions/_shared', `${STAGE}/supabase/functions/_shared`, { recursive: true })

console.log(dry ? '[dry-run] estágio montado em .deploy-edges/ — nada deployado:' : 'deployando:', fns.join(', '))
if (dry) process.exit(0)
if (!process.env.SUPABASE_ACCESS_TOKEN) { console.error('falta SUPABASE_ACCESS_TOKEN'); process.exit(1) }
const git = (c) => execSync(c, { encoding: 'utf8' }).trim()
if (git('git status --porcelain edge-functions'))
  console.warn('aviso: edge-functions/ tem alteração não commitada — o registro vai apontar pro HEAD, mas o código deployado é o da árvore')
const REGISTRO = 'edge-functions/DEPLOYS.json'
const registro = JSON.parse(readFileSync(REGISTRO, 'utf8'))
for (const fn of fns) {
  // --no-verify-jwt OBRIGATÓRIO: auth é token de sessão no body (CORS só content-type)
  execSync(`npx --yes supabase functions deploy ${fn} --project-ref ${PROJECT} --no-verify-jwt`,
    { cwd: STAGE, stdio: 'inherit' })
  // Registro lido por release-check (edge alterada e não deployada) e por /admin/config.
  registro.edges[fn] = { commit: git('git rev-parse --short HEAD'), em: new Date().toISOString().slice(0, 10) }
  writeFileSync(REGISTRO, JSON.stringify(registro, null, 2) + '\n')
}
console.log(`registro atualizado em ${REGISTRO} — commite junto`)
