
# Login por senha-sem-usuário — área do cliente

## Estado real confirmado (via MCP, read-only)

- `eloi-gestao` hoje autentica com senha fixa em texto puro no código-fonte (`PASSWORD = "eloidesign2026"`), comparação direta `body.password !== PASSWORD`, sem tabela de sessão. A tabela `admin_sessions` e a função `admin-auth` do "plano aprovado" **ainda não existem** no banco — é plano, não fato. Não mexo nisso aqui, só registro pra não presumir infra que não está lá.
- `orcamentos` tem **1 linha hoje**: `cliente = "Campanha 2026 (candidata)"`. Não bate com o único nome em `eloi_clientes` ("Georgia Andrade"). Isso é a prova concreta de que casar por texto é ambíguo — essa linha pode nem ser da Georgia, pode ser um prospect. Backfill é decisão manual do Wilke, não dá pra automatizar com segurança.
- `briefing_links` tem **0 linhas hoje**. Backfill = zero trabalho.
- `eloi_clientes` tem 1 linha real: Georgia Andrade (`9963f88d-55d3-466b-a013-6e3b87385f29`, `marca_slug='georgia-andrade'`).

## Decisão central (o que resolve tudo de uma vez)

A "senha" gerada pelo Wilke não é só o segredo — é **prefixo público + segredo**, uma única string colada em um único campo:

```
K7M2-QXTN8PLW
└─┬─┘ └───┬───┘
prefixo   segredo (isso sim vira hash)
(índice)
```

O cliente só vê "cole sua senha aqui" — 1 campo, sem usuário visível. Mas o backend usa os 4 primeiros caracteres como chave de busca indexada (`unique`), e só faz **1 verificação PBKDF2** (não um loop pelos N clientes). Isso resolve de uma vez: lookup sem username, lookup O(1) mesmo se a base crescer, e permite usar iteração PBKDF2 forte (OWASP) sem custo de latência.

---

## 1. Schema

### `eloi_clientes` — colunas novas
```sql
alter table eloi_clientes
  add column area_senha_prefix     text unique,        -- 4 chars, Crockford base32 — não é secreto
  add column area_senha_hash       text,                -- "pbkdf2$<iter>$<salt_b64>$<hash_b64>"
  add column area_senha_gerada_em  timestamptz,
  add column area_tentativas_falhas int not null default 0,
  add column area_bloqueado_ate    timestamptz,
  add column area_ativo            boolean not null default true;  -- kill-switch sem apagar senha
```

### `eloi_cliente_sessions` — tabela nova
```sql
create table eloi_cliente_sessions (
  token       text primary key default encode(extensions.gen_random_bytes(32), 'hex'),
  cliente_id  uuid not null references eloi_clientes(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at  timestamptz not null   -- sliding 24h, atualizado a cada request válido
);
```
Reaproveita o mesmo padrão de token que `briefing_links.token` já usa (`gen_random_bytes` em hex) — não inventei formato novo.

### `orcamentos` / `briefing_links` — FK nullable (migração necessária, ver justificativa abaixo)
```sql
alter table orcamentos      add column cliente_id uuid references eloi_clientes(id);
alter table briefing_links  add column cliente_id uuid references eloi_clientes(id);
```
Backfill hoje: no máximo 1 UPDATE manual em `orcamentos` (se o Wilke confirmar que "Campanha 2026 (candidata)" é da Georgia) — não automatizo isso porque o texto não bate. O campo texto `cliente`/`empresa` continua existindo (prospects sem `eloi_clientes` seguem só com texto livre).

**Por que a migração é necessária de verdade (restrição 4):** dado real acima já mostra que match por texto quebra na primeira linha existente. Uma tabela de mapeamento externa pra evitar 1 `ALTER TABLE` seria mais código pra evitar menos código — não é lazy, é o oposto. A coluna é nullable e aditiva: zero risco pras linhas existentes.

---

## 2. Hashing — PBKDF2 com `crypto.subtle` nativo do Deno

Confirmado (Web Crypto API padrão, `deriveBits` com PBKDF2 funciona nativo em Deno/Supabase Edge Functions, sem lib nenhuma — [Deno Docs](https://docs.deno.com/api/web/crypto/#SubtleCrypto), [MDN deriveBits](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits)):

```ts
const ITERATIONS = 600_000; // OWASP 2023 p/ PBKDF2-SHA256 — pagável pq só roda 1x por login (ver seção 4)

function bytesToBase64(b: Uint8Array): string {
  let bin = ""; for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin); // btoa/atob são globais no Deno, sem import
}
function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function hashPassword(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256
  );
  return `pbkdf2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(secret: string, stored: string): Promise<boolean> {
  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const salt = base64ToBytes(saltB64);
  const expected = base64ToBytes(hashB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: Number(iterStr), hash: "SHA-256" }, keyMaterial, 256
  ));
  return timingSafeEqual(derived, expected);
}

// comparação byte-a-byte sem early-exit — não usar === / Buffer.equals aqui
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```
Formato auto-descritivo (`pbkdf2$iter$salt$hash`) permite subir `ITERATIONS` no futuro sem quebrar hashes antigos.

---

## 3. Lookup sem username — constant-time e o limite de N (restrição 2)

**A pergunta literal do enunciado (varrer as N linhas comparando hash) é viável pra "dezenas"?** Sim, mas com ressalva de latência: PBKDF2-SHA256 a 100k–210k iterações no WebCrypto nativo custa uns 20–100ms por verificação (estimativa — não bati na prática). Um scan linear que roda a verificação em **todas** as N linhas sempre (nunca retorna cedo ao achar match — isso é o que garante tempo constante independente de qual cliente é) custaria:
- N=20 → ~0.5–2s (tolerável)
- N=100 → ~2–10s (ruim pra UX de login)
- N=300+ → risco de timeout / UX quebrada

Ou seja, o scan linear **funciona hoje** (1 cliente real, "dezenas" no horizonte) mas tem teto — e pra não estourar esse teto você é forçado a *baixar* as iterações do PBKDF2 conforme N cresce, o que é a troca errada (menos segurança pra compensar um design que não precisa desse trade-off).

**Por isso o desenho usa o prefixo (seção anterior) em vez do scan.** Com prefixo:
- Lookup é `WHERE area_senha_prefix = $1` — índice único, O(1) de verdade, indiferente a N.
- Só roda **1** PBKDF2 por tentativa de login (o candidato encontrado pelo prefixo) — não N.
- Isso permite manter 600.000 iterações (padrão OWASP atual) sem custo de latência que cresce com a base de clientes.
- Prefixo **não é secreto** (é só um índice, tipo um "username" curto que o cliente nunca precisa saber que existe — ele só cola a string toda). Achar o prefixo de alguém não dá acesso a nada sozinho.

**Tempo constante mesmo assim:** se o prefixo não bate com nenhum cliente, ainda rodo 1 PBKDF2 contra um hash-dummy fixo (constante no código, gerado uma vez offline) antes de responder 401 — assim "prefixo não existe" e "prefixo existe mas senha errada" respondem em tempo parecido, fechando o pequeno vazamento de timing que restaria.

**Resposta direta:** scan linear é viável só pra N bem pequeno e degrada a partir de umas ~100–200 linhas (estimativa); o desenho com prefixo elimina a pergunta "até que N aguenta" — não é mais O(N), é O(1) por design, custando pouquíssimo código a mais (parsear 4 chars de um campo de texto).

---

## 4. Formato da senha gerada + fluxo de geração no admin (resposta à pergunta 4)

```ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (32 chars) — sem I L O U (confundem com 1 0)
// 256 % 32 === 0 → sem viés de módulo no sorteio abaixo

function randomToken(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}
```

- **Prefixo**: 4 chars → 32⁴ ≈ 1.05M combinações. Checado por unicidade na criação (retry se colidir — ver código abaixo). Resolve literalmente a pergunta "e se 2 clientes calharem da mesma senha": a geração garante prefixo único, então nem chega a ser ambíguo no lookup.
- **Segredo**: 8 chars → 32⁸ ≈ 1.1×10¹² combinações (~40 bits). Combinado com lockout de 5 tentativas/15min (seção 5), força bruta online é inviável mesmo em anos de tentativa contínua. Se quiser mais margem pro caso de vazamento do hash offline, é só subir a constante pra 10–12 chars — mesmo código.
- **Formato final mostrado**: `K7M2-QXTN8PLW` (13 chars com o traço) — curto o bastante pra digitar/mandar por WhatsApp, alfabeto sem ambiguidade visual.

### Ação nova no admin (`eloi-gestao`, mesmo padrão de dispatch por `action` que já existe lá)

```ts
if (action === "clientes.gerar_senha_area") {
  const clienteId = body?.cliente_id;
  if (!clienteId) return json({ error: "cliente_id obrigatório" }, 400);

  let prefix = "";
  for (let tries = 0; tries < 5; tries++) {
    prefix = randomToken(4);
    const { count } = await supabase.from("eloi_clientes")
      .select("id", { count: "exact", head: true }).eq("area_senha_prefix", prefix);
    if (!count) break;
  }
  const secret = randomToken(8);
  const hash = await hashPassword(secret);

  const { error } = await supabase.from("eloi_clientes").update({
    area_senha_prefix: prefix,
    area_senha_hash: hash,
    area_senha_gerada_em: new Date().toISOString(),
    area_tentativas_falhas: 0,
    area_bloqueado_ate: null,
    area_ativo: true,
  }).eq("id", clienteId);
  if (error) return json({ error: error.message }, 500);

  return json({ senha: `${prefix}-${secret}` }); // única vez que o texto puro existe — nunca é salvo
}
```

**"Onde ele vê de novo se esquecer" (não existe recuperação por e-mail neste desenho):** em lugar nenhum — o texto puro só existe no retorno HTTP dessa chamada, uma vez. A UI do admin mostra num modal com aviso "copiei, fechar" e não persiste. **Esqueceu = regenerar.** Rodar `clientes.gerar_senha_area` de novo invalida a senha antiga (sobrescreve hash e prefixo) e gera uma nova pro Wilke reenviar por WhatsApp. Isso não é uma lacuna — é a resposta intencional a "sem recuperação por e-mail": reset = reemissão pelo dono da agência, que é exatamente o modelo de confiança pedido.

---

## 5. Fluxo de login completo (pseudocódigo, função pública nova `area-cliente`)

```ts
if (action === "login") {
  const raw = String(body?.senha || "").replace(/[\s-]/g, "").toUpperCase();
  const prefix = raw.slice(0, 4);
  const secret = raw.slice(4);

  const { data: cliente } = await supabase
    .from("eloi_clientes")
    .select("id, nome, area_senha_hash, area_tentativas_falhas, area_bloqueado_ate, area_ativo")
    .eq("area_senha_prefix", prefix)
    .maybeSingle();

  if (!cliente || !cliente.area_ativo || !cliente.area_senha_hash) {
    await verifyPassword(secret, DUMMY_HASH); // custo de tempo parecido c/ caminho "achou"; resultado descartado
    return json({ error: "senha inválida" }, 401);
  }

  if (cliente.area_bloqueado_ate && new Date(cliente.area_bloqueado_ate) > new Date()) {
    return json({ error: "muitas tentativas, tente novamente mais tarde" }, 429);
    // sem rodar PBKDF2 aqui — já está bloqueado, não há novo dado pra vazar
  }

  const ok = await verifyPassword(secret, cliente.area_senha_hash);

  if (!ok) {
    const tentativas = (cliente.area_tentativas_falhas ?? 0) + 1;
    const patch: Record<string, unknown> = { area_tentativas_falhas: tentativas };
    if (tentativas >= 5) {
      patch.area_bloqueado_ate = new Date(Date.now() + 15 * 60_000).toISOString();
      patch.area_tentativas_falhas = 0; // janela nova começa limpa
    }
    await supabase.from("eloi_clientes").update(patch).eq("id", cliente.id);
    return json({ error: "senha inválida" }, 401);
  }

  await supabase.from("eloi_clientes")
    .update({ area_tentativas_falhas: 0, area_bloqueado_ate: null })
    .eq("id", cliente.id);

  const { data: session } = await supabase.from("eloi_cliente_sessions")
    .insert({ cliente_id: cliente.id, expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() })
    .select("token").single();

  return json({ token: session.token, cliente_nome: cliente.nome });
}
```

`DUMMY_HASH` é uma constante fixa no código (gerar 1x offline com `hashPassword("qualquer-coisa")` e colar o resultado como literal) — não precisa ser gerado por request.

---

## 6. Rate limit / lockout (resposta à restrição 3)

Sem infra nova — só as 2 colunas já no schema acima:

- **Threshold**: 5 tentativas erradas.
- **Lockout**: 15 minutos fixos (`area_bloqueado_ate`), sem backoff progressivo — `ponytail: lockout fixo, trocar por backoff exponencial se aparecer abuso repetido de verdade`.
- **Reset**: zera em login bem-sucedido, ou implicitamente ao passar `area_bloqueado_ate` (não precisa cron — é só uma comparação de timestamp no próprio request).
- **Por que por-cliente e não por-IP**: um atacante trocando de IP não ganha nada, porque o lockout trava a *conta* (via prefixo), não o IP — defende contra IP rotativo, que um throttle por-IP sozinho não pegaria.
- **Fora do escopo v1**: throttle global por IP (útil contra alguém testando muitos prefixos diferentes atrás de "algum" válido — mas achar um prefixo válido sozinho não dá acesso a nada, então o ganho de um atacante é baixo). Adicionar se aparecer esse padrão de abuso nos logs.

---

## 7. Marca pública × NF privada — decisão explícita, precisa de OK do Wilke (restrição 5)

Duas opções reais, escolhendo a (a):

**(a) Marca continua pública exatamente como hoje** — `/entregas-marca/<slug>/` segue acessível sem login, bucket continua `public=true`. A área do cliente só ganha um **link** pra essa mesma página pública, como conveniência de "achar tudo num lugar só" — não como novo perímetro de segurança. Justificativa: a decisão anterior já classificou esses arquivos como "aprovados, não sensíveis"; login na área do cliente não muda nada sobre quem já conseguia acessar a URL direta antes. É mais descobrível, não mais seguro — e devo dizer isso explicitamente, não deixar passar como se tivesse virado seguro.

**(b) Migrar marca pra dentro do login também** — bucket vira privado, manifest.json e assets passam a exigir signed URL (mesmo padrão do NF), o script de renderização client-side (`fetch` direto no bucket público hoje) precisa ser reescrito pra passar pela function autenticada. Regressão real de comportamento (a página pública de hoje deixaria de existir) e escopo bem maior que "desenhar o login".

**Recomendação: (a) agora, com aviso explícito ao Wilke de que marca segue publicamente acessível por fora do login** — se ele decidir que isso é inaceitável (por exemplo, se um cliente reclamar que a URL da marca dele "vazou" pra alguém), (b) vira uma tarefa separada e maior, não um ajuste no meio deste desenho.

---

## 8. Sessão / leitura autenticada (esqueleto, não é o foco da tarefa mas fecha o fluxo)

Função pública `area-cliente`, demais ações recebem `{ token, action, ... }`:
1. `SELECT * FROM eloi_cliente_sessions WHERE token = $1 AND expires_at > now()` → se não achar, 401.
2. Em request válido, `UPDATE ... SET last_seen_at = now(), expires_at = now() + interval '24h'` (sliding, mesmo espírito do `admin_sessions` do plano de admin).
3. Toda query de dado real é filtrada por `cliente_id` da sessão — nunca por texto solto:
   - NF: `eloi_servicos WHERE cliente_id = $cliente_id` + reusa `nf.view_url` (signed URL 120s) já existente, só trocando o gate de senha-admin pra sessão-cliente.
   - Orçamentos: `orcamentos WHERE cliente_id = $cliente_id` — linhas antigas sem `cliente_id` preenchido simplesmente não aparecem (falha fechada, não aberta).
   - Briefing: `briefing_links WHERE cliente_id = $cliente_id`.
   - Marca: link direto pra `/entregas-marca/<marca_slug>/` pública (seção 7).

---

## O que fica de fora deste desenho (ponytail)

- Throttle por IP → adicionar se os logs mostrarem tentativa de enumerar prefixos em massa.
- Backoff progressivo no lockout → adicionar se 15min fixos não segurarem abuso repetido.
- Bucket de marca virando privado → decisão separada do Wilke, escopo maior (ver seção 7).
- Troca de senha pelo próprio cliente → não pedido; só o Wilke gera/regenera.

Sources:
- [Crypto - Web documentation | Deno Docs](https://docs.deno.com/api/web/crypto/#SubtleCrypto)
- [SubtleCrypto: deriveBits() method - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits)
- [Deno Edge Functions | Supabase Features](https://supabase.com/features/deno-edge-functions)
