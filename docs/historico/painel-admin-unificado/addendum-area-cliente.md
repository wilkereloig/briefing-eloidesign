> Gerado em 2026-07-15 via workflow multiagente (7 agentes: 2 pesquisa + 2 propostas + 2 juízes + 1 síntese), como addendum ao `plano.md` desta mesma pasta.
>
> **Correção pós-síntese (verificado manualmente, não pelo workflow):** o achado "bucket/página de marca nunca existiram" está parcialmente errado — os agentes de pesquisa/julgamento buscaram só arquivos rastreados pelo git e não viram `entregas-marca/georgia-andrade/index.html` + `logo/` (70 arquivos) que eu tinha acabado de construir nesta mesma sessão, como sistema estático (não Storage bucket — por isso a parte do bucket está certa). A conclusão prática do addendum continua válida por outro motivo: nada disso foi commitado nem pushado, logo nada foi deployado em produção — nenhum cliente recebeu link real ainda, então "sem risco de regressão" procede mesmo assim. Mas fica registrado: essa página estática pública + o botão "🔗 link marca" em `gestao/index.html` (que eu mesmo adicionei horas antes) ficam **substituídos** pela decisão deste addendum, não é trabalho perdido (os SVGs/PNGs gerados continuam válidos, só a forma de entrega muda de "arquivo estático público" pra "upload no bucket privado + portal").

> **Override do Wilke (2026-07-15, pós-síntese):** rejeitada a parte da decisão Y sobre MARCA especificamente — ele quer link permanente, sem expiração (motivo real: repasse pra gráfica/agência não pode depender de sessão/TTL). Isso reverte marca pra **pública** de novo — volta a ser exatamente o sistema estático que eu já tinha construído (`entregas-marca/<slug>/index.html`, sem signed URL, sem expiração). O resto do addendum (login por senha, NF/orçamentos/briefings atrás do portal, `cliente_id`, rate-limit) **continua valendo sem mudança** — só a seção "Decisão sobre a marca pública" e os trechos ligados a ela foram corrigidos inline abaixo; o raciocínio original que justificava marca-privada fica só como registro histórico, não é mais a decisão vigente. Também confirmado: o orçamento real hoje ("Campanha 2026 (candidata)") NÃO é da Georgia Andrade — fica sem `cliente_id`, não é mais pendência. E confirmado: 1 usuário admin pra sempre, sem multi-usuário.

## Resumo executivo

Adoto a **Proposta Y** (tudo atrás de login, marca inclusa) como base, com 2 ajustes pontuais vindos das críticas dos dois juízes — não é escolha cega da nota mais alta, é porque o achado que decide o empate (bucket `entregas-marca` e a página pública **não existem**, só um botão morto em `gestao/index.html:406`) elimina o único argumento de peso da Proposta X (evitar regressão de link já em uso). Não há link em uso — não há regressão a evitar.

Os 2 ajustes sobre a Y "pura":
1. **TTL do signed URL de marca sobe de 5min para 24h.** Resolve a fraqueza real que os dois juízes apontaram (cliente não consegue repassar link pra gráfica/agência sem re-autenticar) sem abrir mão do bucket privado — troca de 1 número, zero código novo.
2. **Throttle leve por IP, além do lockout por conta.** Os dois juízes notaram que lockout só-por-conta permite um atacante que descobriu o prefixo de alguém travar a conta da vítima por 15min (DoS contra quem devia ser protegido). 1 tabela extra sem índice, mesmo padrão simples que a Proposta X já usava, cobre os dois vetores.

Fora isso, a Y como desenhada já é a lazy option certa aqui: schema mais enxuto (1 tabela de sessão, não 2), lookup O(1) por prefixo em vez de scan O(N), OWASP 600k iterações sem custo de latência.

## Decisao sobre a marca publica (X vs Y) — com justificativa explicita

**Decisão: marca migra para dentro do login (bucket `entregas-marca` nasce privado).**

Justificativa, na ordem que decide isso:

1. **Não existe nada público para quebrar hoje** — verificado 3x independentemente (pesquisa original, Juiz 1, Juiz 2), sempre com o mesmo resultado: `select id,name,public from storage.buckets` só retorna `anexos` e `eloi-notas`, ambos privados; `Glob entregas-marca/**` no repo não acha nenhum `index.html`, só o script Node local em `entregas-marca/_tools/`. O que existe é `gestao/index.html:406-409` (`copiarLinkMarca()`), um botão que **gera uma URL para uma página que nunca foi construída**. Se esse link já foi copiado e mandado pra Georgia Andrade em algum momento, ele aponta pra um 404 — não para uma página real.
2. Isso derruba o argumento central da Proposta X ("não regredir link em posse de terceiro") — não há regressão possível sobre algo que nunca existiu. Sobra só o argumento de negócio de X ("arte-final aprovada não é segredo, não faz sentido de UX proteger"), que é legítimo mas não decide sozinho: o pedido original é justamente "área de cliente" com um modelo de ameaça único e consistente, e ter **uma exceção pública explorável por adivinhação de slug** (`marca_slug` é legível, não token) é o tipo de inconsistência que o enunciado pediu pra evitar.
3. **Trade-off assumido, não escondido:** cada visualização de marca custa 1 chamada à edge function pra pegar signed URLs em vez de um `<img src>` direto num bucket público. Para o volume desta agência (1 cliente hoje, dezenas no horizonte, entrega pontual por projeto) isso é imperceptível.
4. **Ajuste sobre a Y original — TTL de 24h em vez de 5min** para os signed URLs de marca (só de marca; NF continua em 120s, é dado sensível de verdade). Justificativa: marca é o artefato que o cliente mais precisa repassar a terceiros (gráfica, agência de mídia) sem fricção — 5min inviabiliza isso na prática, 24h dá folga de sobra sem virar link permanente indexável.

O que **não muda**: `eloi_clientes.marca_publicada` continua existindo como kill-switch por cliente (se `false`, a aba Marca do portal mostra "ainda não publicado" e a function recusa `marca.asset_urls`) — mesmo controle que já existe, só que agora é a única porta de entrada, não uma de duas.

## Modelo de dados (colunas novas em eloi_clientes, migracao cliente_id em orcamentos/briefing_links, qualquer tabela nova)

```sql
-- db/portal-cliente.sql (proposto, NAO aplicado)

-- 1. senha do portal: hash + prefixo, nunca texto puro
alter table public.eloi_clientes
  add column if not exists portal_senha_prefix     text unique,        -- 4 chars, indice de busca, NAO secreto
  add column if not exists portal_senha_hash        text,               -- "pbkdf2$<iter>$<salt_b64>$<hash_b64>"
  add column if not exists portal_senha_gerada_em   timestamptz,
  add column if not exists portal_tentativas_falhas integer not null default 0,
  add column if not exists portal_bloqueado_ate     timestamptz,
  add column if not exists portal_ativo             boolean not null default true; -- kill-switch sem apagar a senha

-- 2. cliente_id nas 2 tabelas que hoje so tem texto livre ("cliente"/"empresa")
alter table public.orcamentos      add column if not exists cliente_id uuid references public.eloi_clientes(id);
alter table public.briefing_links  add column if not exists cliente_id uuid references public.eloi_clientes(id);
create index if not exists orcamentos_cliente_id_idx     on public.orcamentos(cliente_id);
create index if not exists briefing_links_cliente_id_idx on public.briefing_links(cliente_id);

-- 3. sessao do portal — mesmo padrao de token hex que briefing_links.token ja usa
create table if not exists public.portal_sessions (
  token        text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  cliente_id   uuid not null references public.eloi_clientes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours') -- sliding, mesmo espirito do admin_sessions do plano de admin
);
alter table public.portal_sessions enable row level security; -- sem policy: so a service-role (edge function) acessa

-- 4. throttle por IP (ajuste sobre a Y pura — ver secao de login) — defende contra scan de prefixo, nao so contra 1 conta
create table if not exists public.portal_login_ip_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
alter table public.portal_login_ip_attempts enable row level security;
-- ponytail: sem indice/cleanup — volume de hoje (1 cliente) nao pesa a tabela.
-- Se crescer: index (ip, attempted_at) + cron apagando linhas com >24h.

-- 5. bucket de marca — REVERTIDO por pedido do Wilke: publico, link permanente (nao privado como a Y original propunha)
insert into storage.buckets (id, name, public) values ('entregas-marca', 'entregas-marca', true)
  on conflict (id) do nothing;
```

**Backfill:** nenhum automático. `orcamentos` tem 1 linha real hoje (`cliente = "Campanha 2026 (candidata)"`) que não bate com nenhum nome em `eloi_clientes` — é decisão manual do Wilke (é da Georgia? é rascunho sem cliente definido?). `briefing_links` tem 0 linhas, nasce vazia. Enquanto `cliente_id` não for associado, esses registros simplesmente não aparecem no portal — falha fechada, não bug.

**Fora do escopo desta migração de banco, mas necessário pra `cliente_id` ser útil daqui pra frente:** `painel-orcamentos/index.html:141` e `painel-briefings/index.html:116` trocam o `<input type="text">` livre por um `<select>` populado por `eloi-gestao` `clientes.list` (já existe) + o texto livre continua editável por baixo pra casos "avulso/outro". É código de UI separado, não incluído aqui.

## Mecanismo de login por senha (hashing, lookup, rate-limit) — pseudocodigo real

Senha gerada pelo Wilke = `PREFIXO-SEGREDO` (ex: `K7M2-QXTN8PLW`), alfabeto Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — sem `I L O U`, sem ambiguidade visual, 256%32=0 sem viés de módulo). Prefixo (4 chars) é índice de busca O(1), não é secreto; segredo (8 chars, ~40 bits) é o que vira hash.

```ts
// supabase/functions/_shared/portal-auth.ts
const ITERATIONS = 600_000; // OWASP 2023 p/ PBKDF2-SHA256 — pagavel pq lookup e O(1), roda 1x por login, nao N vezes

function b64(b: Uint8Array) { let s=""; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }
function unb64(s: string) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function hashPassword(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(secret: string, stored: string): Promise<boolean> {
  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(saltB64), iterations: Number(iterStr), hash: "SHA-256" }, key, 256));
  return timingSafeEqual(derived, unb64(hashB64));
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array) { // sem early-exit, tempo constante
  if (a.length !== b.length) return false;
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff === 0;
}
const DUMMY_HASH = "pbkdf2$600000$..."; // gerado 1x offline, literal no codigo — usado quando prefixo nao bate ninguem
```

Fluxo de login (`portal-cliente`, action `login`) — 2 camadas de rate-limit (conta + IP), lookup O(1) por prefixo:

```ts
if (action === "login") {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const since = new Date(Date.now() - 15*60_000).toISOString();
  const { count } = await supabase.from("portal_login_ip_attempts")
    .select("id", { count:"exact", head:true }).eq("ip", ip).gte("attempted_at", since);
  if ((count ?? 0) >= 20) return json({ error: "muitas tentativas, aguarde" }, 429); // limite alto: so pega scan de prefixo, nao usuario normal errando 1x
  await supabase.from("portal_login_ip_attempts").insert({ ip }); // conta antes de validar, sem branch pra burlar

  const raw = String(body?.senha || "").replace(/[\s-]/g, "").toUpperCase();
  const prefix = raw.slice(0, 4), secret = raw.slice(4);

  const { data: c } = await supabase.from("eloi_clientes")
    .select("id,nome,marca_slug,portal_senha_hash,portal_tentativas_falhas,portal_bloqueado_ate,portal_ativo")
    .eq("portal_senha_prefix", prefix).maybeSingle();

  if (!c || !c.portal_ativo || !c.portal_senha_hash) {
    await verifyPassword(secret, DUMMY_HASH); // custo de tempo parecido ao caminho "achou" — fecha timing leak
    return json({ error: "senha invalida" }, 401);
  }
  if (c.portal_bloqueado_ate && new Date(c.portal_bloqueado_ate) > new Date())
    return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429); // sem rodar PBKDF2 — ja bloqueado

  const ok = await verifyPassword(secret, c.portal_senha_hash);
  if (!ok) {
    const tentativas = (c.portal_tentativas_falhas ?? 0) + 1;
    const patch: Record<string, unknown> = { portal_tentativas_falhas: tentativas };
    if (tentativas >= 5) { patch.portal_bloqueado_ate = new Date(Date.now()+15*60_000).toISOString(); patch.portal_tentativas_falhas = 0; }
    await supabase.from("eloi_clientes").update(patch).eq("id", c.id);
    return json({ error: "senha invalida" }, 401);
  }

  await supabase.from("eloi_clientes").update({ portal_tentativas_falhas: 0, portal_bloqueado_ate: null }).eq("id", c.id);
  const { data: sess } = await supabase.from("portal_sessions").insert({ cliente_id: c.id }).select("token").single();
  return json({ token: sess.token, cliente_nome: c.nome });
}
```

Por que 2 camadas (não só 1): lockout por conta (5/15min) é o que a restrição 3 do enunciado pede literalmente — trava quem está tentando adivinhar a senha de UM cliente. Throttle por IP (20/15min, limite alto de propósito) cobre o vetor que só o lockout por conta deixa passar: alguém escaneando muitos prefixos diferentes atrás de "algum" válido, e também impede que um atacante trave deliberadamente a conta de uma vítima repetindo o mesmo prefixo — o IP dele esgota antes de conseguir bater 5 tentativas contra 1 prefixo só se ele tentar vários. `ponytail: limite de IP alto e sem lockout progressivo — sobe/backoff so se aparecer abuso real nos logs (get_logs).`

Geração da senha (ação `clientes.gerar_senha_portal` em `eloi-gestao`, mesmo padrão de dispatch já existente):

```ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function randomToken(len: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), b => ALPHABET[b % ALPHABET.length]).join("");
}
if (action === "clientes.gerar_senha_portal") {
  const clienteId = body?.cliente_id;
  if (!clienteId) return json({ error: "cliente_id obrigatorio" }, 400);

  let prefix = "";
  for (let tries = 0; tries < 5; tries++) {
    prefix = randomToken(4);
    const { count } = await supabase.from("eloi_clientes")
      .select("id", { count:"exact", head:true }).eq("portal_senha_prefix", prefix);
    if (!count) break; // 32^4 ~ 1.05M combinacoes — unique no banco garante, isso e so retry otimista
  }
  const secret = randomToken(8); // 32^8 ~ 1.1e12 combinacoes (~40 bits)
  const hash = await hashPassword(secret);

  await supabase.from("eloi_clientes").update({
    portal_senha_prefix: prefix, portal_senha_hash: hash,
    portal_senha_gerada_em: new Date().toISOString(),
    portal_tentativas_falhas: 0, portal_bloqueado_ate: null, portal_ativo: true,
  }).eq("id", clienteId);

  return json({ senha: `${prefix}-${secret}` }); // unica vez que existe em texto puro — nunca salvo
}
```

**Como isso resolve "2 clientes com a mesma senha" (restrição 2):** por construção. `portal_senha_prefix` é `unique` no banco — o lookup nunca é ambíguo, não existe o caso "a senha bate em mais de 1 cliente" a menos que alguém edite o banco manualmente por fora do fluxo. Não é prevenção probabilística (testar contra todos os hashes existentes) nem defesa em profundidade em runtime — é impossível por design, o que é menos código, não mais.

## Edge function "portal-cliente" (lista de actions)

Um arquivo, `supabase/functions/portal-cliente/index.ts`, mesmo padrão de dispatch por `action` que `eloi-gestao` já usa:

| action | auth | o que faz |
|---|---|---|
| `login` | pública | valida senha (seção acima), cria `portal_sessions`, devolve `token` |
| `logout` | token | apaga a linha de `portal_sessions` |
| `me` | token | `eloi_clientes` (nome, marca_slug, marca_publicada) do `cliente_id` resolvido do token |
| ~~`marca.asset_urls`~~ | — | **removida** — marca voltou a ser bucket público (pedido do Wilke: link permanente). Tab "Marca" do portal só monta a URL direto (`.../storage/v1/object/public/entregas-marca/<slug>/...` ou a página estática já existente), sem passar pela edge function |
| `servicos.list` | token | `eloi_servicos where cliente_id = $token.cliente_id`, omite `nf_arquivo_url` bruto, expõe só `tem_nf: boolean` |
| `nf.view_url` | token | recebe `{ servico_id }`, confere `cliente_id` bate antes de assinar, `createSignedUrl(path, 120)` — reaproveita 1:1 o padrão que já existe em `eloi-gestao` |
| `orcamentos.list` | token | `orcamentos where cliente_id = $token.cliente_id` |
| `briefings.list` | token | `briefing_links where cliente_id = $token.cliente_id` |

Toda action "com token" resolve `cliente_id` a partir de `portal_sessions.token` — **nunca aceito no body** — e faz sliding update de `expires_at` (+12h) a cada chamada válida, mesmo espírito do `admin_sessions` do plano de admin unificado (ainda não implementado em produção, mas é o padrão a seguir).

## Fluxo do Wilke (como ele gera/entrega a senha de um cliente)

1. No `/gestao/` (painel de clientes), cada linha ganha um botão **"Gerar senha do portal"** — este botão **substitui** o atual `copiarLinkMarca()` de `gestao/index.html:406-409` (que hoje gera um link morto para uma página que não existe).
2. Botão chama `eloi-gestao` action `clientes.gerar_senha_portal` com o `cliente_id`.
3. Modal mostra a senha (`K7M2-QXTN8PLW`) **uma única vez**, com botão de copiar e aviso: *"Envie por WhatsApp agora. Fechando esta janela, a senha não aparece de novo em lugar nenhum — só o hash fica salvo."*
4. Wilke copia e manda por WhatsApp.
5. **Esqueceu = regenerar.** Rodar `clientes.gerar_senha_portal` de novo sobrescreve prefixo e hash, invalida a senha antiga e derruba qualquer sessão futura que dependesse dela — não existe recuperação por e-mail, por decisão explícita do enunciado.

## Tela /portal/ (o que o cliente ve, tab por tab)

Arquivo único `portal/index.html`, HTML puro sem build, mesmo padrão de `gestao/index.html`. Sessão em `sessionStorage` (guarda o token opaco de sessão, nunca a senha).

- **Login**: 1 campo de senha (`placeholder="Cole sua senha (ex: K7M2-QXTN8PLW)"`), sem campo de usuário/e-mail. Erro genérico "senha incorreta" tanto pra prefixo inexistente quanto pra senha errada (não vaza qual caso é).
- **Marca**: chama `me` → se `marca_publicada=false`, mostra "seus arquivos ainda não foram publicados". Se `true`, link direto pra `/entregas-marca/<slug>/` (público, permanente — pedido explícito do Wilke, sem signed URL, sem expiração) — o portal só agrega o link, não intermedia o acesso.
- **Notas Fiscais**: lista de `eloi_servicos` (descrição, valor, status, pago/em aberto), botão "Ver nota fiscal" só nos que têm `tem_nf=true`, abre signed URL de 120s sob demanda (`nf.view_url`) — igual ao padrão do admin hoje.
- **Orçamentos**: lista de `orcamentos` do cliente, link "Ver proposta completa" pra `/orcamento/?t=<share_token>` (a página pública com token continua existindo, não é removida — o portal só agrega o que já existe).
- **Briefing**: lista de `briefing_links` do cliente (tipo, status, data de resposta) — somente leitura, sem re-submissão pelo portal.

Registros sem `cliente_id` (o único orçamento real hoje) não aparecem em tab nenhuma — falha fechada.

## Plano de migracao (fases, incluindo o que fazer com o link publico do Georgia Andrade se a decisao for Y)

1. Aplicar a migração SQL da seção "Modelo de dados" (colunas em `eloi_clientes`, `cliente_id` em `orcamentos`/`briefing_links`, `portal_sessions`, `portal_login_ip_attempts`, bucket `entregas-marca` **público** — revertido).
2. Deploy de `supabase/functions/_shared/portal-auth.ts` + `supabase/functions/portal-cliente/index.ts` (sem a action `marca.asset_urls`, removida).
3. Adicionar action `clientes.gerar_senha_portal` em `eloi-gestao` + trocar o botão `copiarLinkMarca()` por "Gerar senha do portal" em `gestao/index.html` (código separado desta sessão de planejamento, mas é pré-requisito — sem isso o botão atual continua gerando um link morto). O link de marca (`copiarLinkMarca()`) continua existindo à parte, agora apontando pro sistema estático público já construído.
4. A entrega de marca da Georgia Andrade já está pronta (sistema estático construído nesta sessão, `entregas-marca/georgia-andrade/`) — só falta commitar/publicar (fora do escopo deste planejamento).
5. Publicar `/portal/index.html` (NF, orçamentos, briefings — marca é só um link de conveniência dentro dele).
6. Sem passo de migração de link morto — nunca existiu link público em uso, nada a fazer aqui.
7. Wilke gera a senha da Georgia Andrade (fluxo acima) e envia por WhatsApp.
8. ~~Decidir se o orçamento associa à Georgia~~ — resolvido: não é dela, fica sem `cliente_id`.
9. (Fora desta sessão, sinalizado como pendência) trocar `<input>` livre por `<select>` de cliente em `painel-orcamentos`/`painel-briefings`, para que `cliente_id` passe a ser preenchido em registros futuros sem depender de UPDATE manual.

## Riscos abertos / decisoes que so o Wilke pode tomar

- ~~Confirmar decisão de marca-atrás-de-login~~ — **resolvido**: marca fica pública, link permanente. Sem TTL, sem re-autenticação pra repassar pra gráfica.
- **Lockout por conta pode ser usado como DoS contra a própria vítima** (achado pelos 2 juízes, não resolvido, só mitigado pelo throttle de IP): alguém que descubra o prefixo de um cliente específico ainda consegue travar a conta dele por 15min errando 5x — o throttle de IP relativiza isso (esgota antes de conseguir repetir o padrão facilmente), mas não elimina. Aceito como está pelo volume atual; upgrade seria CAPTCHA ou backoff progressivo se virar abuso real.
- ~~`orcamentos` — decidir se a linha real é da Georgia~~ — **resolvido**: não é, fica sem `cliente_id`.
- **Formato da senha** (`PREFIXO-SEGREDO`, 13 chars com hífen) — validar que é confortável de copiar/colar/reler no WhatsApp; é fácil encurtar/alongar o segredo (constante `randomToken(8)`) se o Wilke achar longo demais.
- **Correção do botão morto em `gestao/index.html:406-409`** é código, não incluída nesta sessão de planejamento — fica registrada como pré-requisito do rollout (fase 3), não deve ser esquecida.