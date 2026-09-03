// scripts/release-check.mjs — "estou publicando o que acho que estou publicando?"
// Motivo de existir: em 2026-08-28 o repo ficou 9 commits à frente das edges em
// produção e um `app/dist` velho pode ir pro ar sem erro nenhum (a Vercel não
// builda). Este script falha alto em cada um desses casos.
// Uso:  npm run release:check
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const falhas = []
const avisos = []

// 1. Árvore de trabalho — o que publica tem que estar commitado.
try { sh('git fetch -q origin') } catch { avisos.push('sem rede: comparando com o origin/master local') }
const PUBLICA = /^(app\/(src|dist|public)\/|edge-functions\/|database\/migrations\/|assets\/|vercel\.json$|index\.html$|[a-z0-9-]+\/index\.html$)/
const sujo = sh('git status --porcelain').split('\n').filter(Boolean)
const sujoPublica = sujo.filter((l) => PUBLICA.test(l.slice(3)))
if (sujoPublica.length) falhas.push('alterações não commitadas em arquivos que publicam:\n  ' + sujoPublica.join('\n  '))
const soltos = sujo.filter((l) => l.startsWith('??') && !PUBLICA.test(l.slice(3))).map((l) => l.slice(3))
if (soltos.length) avisos.push('arquivos soltos fora do git (não publicam): ' + soltos.join(', '))

// 2. lint + tipos + testes + build + deno — o build regenera app/dist.
execSync('npm run verify', { stdio: 'inherit' })

// 3. app/dist tem que ser exatamente o build de app/src (o build é determinístico).
const distSujo = sh('git status --porcelain app/dist')
if (distSujo) falhas.push('app/dist não corresponde ao build atual de app/src — commite o dist junto:\n  ' + distSujo.split('\n').join('\n  '))

// 4. Edge alterada desde o último deploy registrado em DEPLOYS.json.
const registro = JSON.parse(readFileSync('edge-functions/DEPLOYS.json', 'utf8'))
const edges = readdirSync('edge-functions').filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3))
const pendentes = []
for (const fn of edges) {
  if (registro.ignorar?.[fn]) continue
  const rec = registro.edges[fn]
  if (!rec) { avisos.push(`${fn}: nenhum deploy registrado em DEPLOYS.json`); continue }
  // _shared vai no bundle do deploy — só conta pra quem importa de lá.
  const alvos = `edge-functions/${fn}.ts` +
    (readFileSync(`edge-functions/${fn}.ts`, 'utf8').includes('./_shared/') ? ' edge-functions/_shared' : '')
  let diff = ''
  try { diff = sh(`git diff --name-only ${rec.commit} HEAD -- ${alvos}`) }
  catch { avisos.push(`${fn}: commit ${rec.commit} do registro não existe neste clone`); continue }
  if (diff) pendentes.push(fn)
}
if (pendentes.length) falhas.push('edge alterada e não deployada — produção diverge do repo:\n  npm run edges:deploy -- ' + pendentes.join(' '))

// 5. Migrações que entraram depois do que está no origin — aplicar ANTES do deploy.
let migracoes = ''
try { migracoes = sh('git diff --name-only origin/master...HEAD -- database/migrations') } catch { /* sem origin */ }
const migracoesSoltas = sujo.filter((l) => /^database\/migrations\//.test(l.slice(3))).map((l) => l.slice(3))
const todas = [...migracoes.split('\n').filter(Boolean), ...migracoesSoltas]
if (todas.length) avisos.push('migrações novas — aplicar no SQL editor antes de deployar edge:\n  ' + todas.join('\n  '))

// 6. Commits não enviados — push publica na Vercel.
let ahead = '0'
try { ahead = sh('git rev-list --count origin/master..HEAD') } catch { /* sem origin */ }
if (ahead !== '0') avisos.push(`${ahead} commit(s) ainda não no origin — o push publica o site`)

console.log('\n── release:check ──')
for (const a of avisos) console.log('aviso  ' + a)
for (const f of falhas) console.log('FALHA  ' + f)
if (falhas.length) { console.log(`\n${falhas.length} falha(s). Não publique.`); process.exit(1) }
console.log('ok — repo e build coerentes' + (avisos.length ? ` (${avisos.length} aviso(s))` : ''))
