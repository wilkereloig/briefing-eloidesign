## TL;DR

Reaproveita o padrão de `eloi-notas` quase 1:1, mas fica **mais simples** porque o bucket é público: nada de `nf.view_url`/signed read, nenhuma RLS policy precisa existir. Path dentro do bucket espelha exatamente a árvore de pastas atual (`<slug>/manifest.json`, `<slug>/logo/<variacao>/<cor>.svg|png|preview.png`, `<slug>/<slug>-marca-completa.zip`), então `entrega.js` muda uma linha (`./` → `BASE`). Recolorir é regex, rasterizar é `<canvas>` nativo, zipar é `fflate` client-side com os blobs que já estão na memória — sem lib de zip no Deno, sem reler o Storage. Custo é irrelevante na escala desse negócio (ver números reais abaixo).

---

## 1. O que existe hoje (lido em `edge-functions/eloi-gestao.ts:129-143`)

```ts
const BUCKET = "eloi-notas";
// nf.upload_url: cria path, supabase.storage.from(BUCKET).createSignedUploadUrl(path)
// nf.view_url:   supabase.storage.from(BUCKET).createSignedUrl(body.path, 120)
```

Confirmado no banco (`select * from storage.buckets`): hoje existem **2 buckets, os dois privados** — `anexos` (10MB limit, mimes de imagem+pdf, tem policies soltas pra role `authenticated` que provavelmente nunca é usada porque esse site não tem sessão Supabase Auth real) e `eloi-notas` (sem limit, **zero policies** — o comentário no `db/eloi-gestao.sql:31` já documenta o motivo: "Sem políticas para anon/authenticated: acesso só via edge (service-role bypassa RLS)"). Esse é o padrão a repetir.

`entregas-marca` seria o **primeiro bucket público** do projeto — vale marcar isso explicitamente quando for criar, não é "mais um bucket igual aos outros".

Estrutura real de referência (georgia-andrade, medida agora): 5 variações × 7 cores × 3 arquivos (svg/png/preview.png) = **105 arquivos, 6.0MB**, zip pré-gerado **4.5MB**. `entrega.js` usa só paths relativos (`./manifest.json`, `./${f.svg}`, `./${slug}-marca-completa.zip`) — nenhum path absoluto, nenhuma lib externa carregada (nem supabase-js: o site inteiro só faz `fetch()` cru pros edge functions).

## 2. Bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'entregas-marca', 'entregas-marca', true,
  26214400, -- 25MB, cobre até um zip gordo de cliente com muitas variações
  array['image/svg+xml','image/png','application/json','application/zip']
)
on conflict (id) do nothing;
```

**Nenhuma RLS policy é necessária.** Leitura pública passa pela rota `/storage/v1/object/public/<bucket>/<path>`, que ignora RLS por definição de bucket público. Escrita só acontece via signed upload URL emitida pelo edge function com a service-role key — a autorização mora no token assinado, não numa policy de INSERT. Ou seja: mais simples que `anexos` (que tem policies mortas) e igual a `eloi-notas` (zero policies, "acesso só via edge").

## 3. Path scheme — espelha exatamente a árvore de git atual

```
entregas-marca/                         (bucket)
  <slug>/
    manifest.json
    <slug>-marca-completa.zip
    logo/
      <variacao-id>/
        <cor-slug>.svg
        <cor-slug>.png
        <cor-slug>.preview.png
```

`<cor-slug>` = mesma função `slugify()` que já existe em `_tools/gerar-variacoes.mjs:25-29` (NFD strip acento, lowercase, `[^a-z0-9]+`→`-`) — reaproveitar o algoritmo, não inventar outro.

URL pública real: `https://nlamznxoocmygfvnqcns.supabase.co/storage/v1/object/public/entregas-marca/georgia-andrade/logo/completa/grafite.svg`

Por que espelhar exatamente: `entrega.js` hoje monta tudo com `./${f.svg}` etc. Migrar = trocar **uma constante** (`const BASE = "https://.../object/public/entregas-marca/" + slug` em vez de `"."`) e trocar os literais `./${...}` por `${BASE}/${...}`. Zero mudança de lógica, zero re-teste de layout.

Página pública também deixa de precisar de um `index.html` por cliente commitado no git — vira um template genérico que lê `slug` da URL e faz `fetch(BASE + "/manifest.json")`. Isso é adjacente ao pedido mas inevitável: sem isso, "gerar 100% pelo navegador" ainda exigiria um commit git por cliente novo, o que reintroduz o problema que essa mudança tenta resolver.

## 4. Fluxo passo a passo (clique "Gerar" → público)

1. Admin sobe SVG(s) mestre (`fill: currentColor`) + edita paleta (nome+hex) na tela — tudo em memória, sem rede.
2. Clique "Gerar", 100% client-side, por variação × cor:
   - Recolorir: `masterSvg.replace(/fill:\s*currentColor/g, `fill: ${hex}`)` — regex, é o que o script Node já faz hoje (`gerar-variacoes.mjs:43`), não precisa de parser de SVG.
   - Rasterizar: `Blob → ObjectURL → new Image() → <canvas>.drawImage → canvas.toBlob('image/png')` em 2000px (full) e 480px (preview) — API nativa do browser, sem `sharp` (que é addon nativo, não roda em Deno Edge Function sem risco).
   - Guardar cada blob em memória com a mesma chave de path do item 3.
3. Montar `manifest.json` em memória (mesmo shape de hoje).
4. Montar o zip **client-side com `fflate.zipSync`** sobre os blobs já em memória, excluindo `*.preview.png` (mesmo filtro do `archive.glob(...,{ignore:[...]})` atual).
5. Um único POST pro edge function: `action: "marca.upload_urls"`, `{ password, slug, paths: [...todas as ~107 chaves] }` → loop server-side chamando `createSignedUploadUrl(path, {upsert:true})` (idêntico a `nf.upload_url`, só em batch) → retorna array de `{path, signed_url, token}`.
6. Browser faz upload direto pro Storage (não passa pelo edge function), paralelo com limite de concorrência (~6): `PUT signed_url` com o blob. Aqui entra a única mudança de convenção: essa chamada precisa do header `apikey: <publishable/anon key>` — o site hoje nunca manda esse header porque as funções chamadas (`eloi-gestao` etc.) rodam com `verify_jwt` desligado; o Storage é outro serviço no gateway e exige `apikey` mesmo assim. **Vale um spike de 5 min confirmando esse PUT com fetch puro antes de construir** — a doc do supabase-js não documenta o endpoint cru, só o helper `uploadToSignedUrl()`; a chamada deve funcionar sem adicionar supabase-js ao cliente, mas isso é a única peça que não confirmei 100% via fonte primária.
7. Só depois que **todos** os uploads confirmarem `ok`, chamar `clientes.upsert` (já existe) com `marca_publicada: true` — evita publicar um estado parcial se a geração cair no meio.
8. Página pública lê `manifest.json` direto da URL pública do Storage — sem token, sem edge function, sem passo extra.

## 5. Zip: por que client-side com fflate, não Deno Edge Function

- Os blobs de todos os ~105 arquivos já existem na memória do browser logo após o passo 2 — zipar ali é reaproveitar dado que já existe, não buscar de novo.
- Servidor teria que: listar o bucket, baixar cada objeto de volta do Storage, empacotar, devolver — mais um round-trip completo de ~6MB por geração, e Deno Edge Function não tem lib de zip nativa (não existe no `std`), então precisaria de dependência de qualquer forma.
- `fflate` (~8kB, MIT, `zipSync({path: Uint8Array}, {level:0})` síncrono) é o menor lib que resolve isso; roda 100% no browser sem servidor. Único ponto: é a **primeira dependência externa client-side** do site (hoje zero libs, só `fetch()` cru) — carregar via `<script>` na página de geração (que é só admin, não a página pública do cliente) é a exceção mais barata possível, não acho que valha reescrever um encoder de ZIP à mão (CRC32 + central directory é escopo real de bug, não "poucas linhas").
- Zip fica pronto, sobe pro Storage como **mais um arquivo estático** (`<slug>-marca-completa.zip`) — nunca é regenerado por download, é servido puro do Storage/CDN. Zero custo de invocação de function por download, igual ao comportamento de hoje.

## 6. Custo / quota (números reais + tiers atuais)

Medido agora no cliente real (georgia-andrade): **~10.5MB armazenados por cliente** (6.0MB assets + 4.5MB zip; a estimativa do briefing de "~70 arquivos + zip ~5MB" bate na mesma ordem de grandeza, o real é um pouco maior: 105 arquivos).

Tiers Supabase 2026 (supabase.com/pricing): Free = 1GB storage / 5GB egress por mês. Pro ($25/mês) = 100GB storage / 250GB egress incluídos, overage de banda a $0.09/GB.

- **Storage nunca é o gargalo**: 1GB free ÷ 10.5MB/cliente ≈ 95 clientes antes de estourar o free tier; 100GB do Pro ≈ 9.500 clientes. Pra uma agência de design, isso é década(s) de operação.
- **Egress é o número que importa, mas ainda é folgado**: uma visita típica à página de entrega carrega ~35 previews (20-50KB cada, ~1-1.5MB) + eventualmente o zip completo (4.5MB) = ~2-6MB por sessão. Mesmo no free tier (5GB/mês, compartilhado com o resto do site), isso é ~800-2500 sessões/mês só pra estourar — muito acima do tráfego real esperado (cada cliente final visita a própria página raramente, não é conteúdo indexado/público de alto tráfego).
- Conclusão prática: **não precisa de plano pago por causa disso**, e não precisa de otimização de egress agora — YAGNI.

## 7. Cache-control

Marcar todo upload com `cacheControl` moderado, não `immutable`: os arquivos são "aprovados" mas o botão "gerar" pode ser clicado de novo pro mesmo `slug` (retrabalho de paleta, correção) e reescreve os mesmos paths (`upsert:true`) — se marcar `immutable` e o cliente já tiver os arquivos em cache de navegador/CDN, uma correção não apareceria. Sugestão: `cache-control: public, max-age=3600` (1h) nos objetos — reduz egress de recarregamentos na mesma sessão sem risco de servir versão velha por muito tempo depois de uma regeneração. Se no futuro quiserem cache agressivo de verdade, o upgrade é versionar o path (`?v=<gerado_em>` vindo do manifest) — não vale construir isso agora, ninguém pediu.

## Fora de escopo desta análise (decisões adjacentes que essa mudança força, mas não foram pedidas aqui)

- Onde vivem as novas actions do edge function (`marca.upload_urls` etc.): mesmo arquivo `eloi-gestao.ts` seguindo o padrão de `nf.upload_url`, ou um function dedicado — depende de como a fusão do admin unificado for desenhada, não decidi isso aqui.
- Template genérico de `entregas-marca/<slug>/index.html` lendo slug da URL em vez de arquivo commitado por cliente — mencionado no passo 3 porque é consequência direta de tirar o "arquivo estático no git", mas o desenho da página em si não foi pedido.
- Não criei bucket, não rodei migration, não escrevi nenhum arquivo — só leitura (`execute_sql` com SELECT, `get_edge_function` via Read local do arquivo) conforme instruído.
