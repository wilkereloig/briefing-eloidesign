# Juiz 1 — ranking: Proposta Y — Área de cliente com marca migrando de pública para privada > Proposta X — Portal mínimo, marca continua pública por fora

## Achado que muda o cálculo (verificado agora, MCP + repo)

Antes de pontuar, confirmei de forma independente (não confiei só no que a Proposta Y alega) o achado central da seção 0 dela:

- `select id,name,public from storage.buckets` → só existem `anexos` (privado) e `eloi-notas` (privado). **Bucket `entregas-marca` não existe.**
- `Glob entregas-marca/**` no repo → só `entregas-marca/_tools/` (script Node local com `node_modules`). **Não existe `entregas-marca/index.html`, nenhuma página pública real.**
- `Grep` em `gestao/index.html` confirma: o botão "🔗 link marca" (linha ~406) **está no ar hoje** e gera `/entregas-marca/<slug>/` — um link morto, clicável, que se o Wilke já copiou/mandou por WhatsApp aponta pra um 404.

Isso é decisivo porque **o argumento central da Proposta X para manter a marca pública** ("não regride comportamento já em produção, quebraria link em posse de cliente real") **é factualmente falso, e X não verificou isso — herdou a premissa sem checar.** Y checou, achou a inconsistência (o botão morto) e tratou isso explicitamente. Isso não decide sozinho qual desenho é "certo" (ainda há um argumento de negócio legítimo em X — arte-final aprovada não é segredo), mas invalida a metade do argumento de X que é sobre *risco/regressão*, e é exatamente o tipo de furo concreto que a tarefa pediu pra eu apontar.

## Notas por critério (1–5)

| Critério | Proposta X | Proposta Y |
|---|---|---|
| 1. Segurança real | **3** | **4** |
| 2. Consistência do modelo de privacidade | **2** | **5** |
| 3. Esforço/risco de implementação | **3** | **4** |
| 4. Experiência do cliente final | **4** | **3** |
| 5. Fit com o plano aprovado (precedente de sessão) | **4** | **4** |
| **Total** | **16/25** | **20/25** |

### 1. Segurança real
- **X = 3.** PBKDF2 a 100.000 iterações — abaixo do mínimo OWASP (600k) para PBKDF2-SHA256, escolhido deliberadamente mais fraco pra caber no scan O(N). O login roda a verificação contra **todos** os clientes com senha configurada, sempre (sem early-return) — isso fecha o timing-leak entre candidatos, mas cria uma superfície de DoS real: custo por request escala com N (com "dezenas" de clientes, cada tentativa de login = dezenas de PBKDF2; um atacante mandando requests concorrentes multiplica isso). Rate-limit só por IP (10/15min) — o próprio texto reconhece que isso não seguraria um atacante com IP rotativo; a defesa real depende quase inteiramente do espaço de senha (10 chars, ~50 bits), não de controle ativo. Marca fica **sem autenticação nenhuma**, acessível por slug legível — furo aceito explicitamente pelo autor.
- **Y = 4.** 600k iterações (padrão OWASP), lookup O(1) por prefixo (não degrada com N), comparação contra hash-dummy fixo quando prefixo não bate (fecha timing-leak "prefixo existe vs não existe"), lockout **por conta** (5 tentativas/15min) — defende o cenário que a restrição 3 do enunciado pede literalmente ("cliente tentando adivinhar a senha de OUTRO cliente específico"), o que X não faz (X só trava por IP, nunca por conta). `marca.asset_urls` implementa e comenta explicitamente o trust-boundary check (`path.startsWith(marca_slug/)`) contra um IDOR óbvio — mostra cuidado, não só teoria.
- **Furo concreto em Y não discutido no texto:** lockout por conta é uma faca de dois gumes — um atacante que descobra o prefixo de um cliente pode deliberadamente errar 5x pra travar a CONTA DELE por 15min, negando acesso ao cliente legítimo (DoS contra a vítima, não contra o atacante). X, por travar só IP, não tem esse vetor específico. Nenhuma das duas propostas trata isso.
- **Furo compartilhado:** nenhuma das duas tem throttle global por IP contra descoberta de prefixo/varredura de senha completa — ambas assumem YAGNI pelo volume atual. Acho a aceitação razoável dado o espaço de busca em ambos os casos, mas é a mesma lacuna nas duas, não decide o ranking.

### 2. Consistência do modelo de privacidade
- **X = 2.** Dois modelos coexistindo por design: NF/orçamento/briefing atrás de senha+hash+rate-limit; marca sem autenticação nenhuma, protegida só por um slug legível e um boolean (`marca_publicada`) que qualquer terceiro que adivinhe o slug ignora. O próprio texto assume isso como "trade-off aceito" — mas a justificativa de risco (preservar link já em uso) é **falsa** (achado acima). Sobra só o argumento de negócio ("arte final não é segredo"), que é legítimo mas não neutraliza o furo: é uma exceção explícita e exploravel num desenho cujo objetivo é justamente unificar acesso.
- **Y = 5.** Uma regra só, sem exceção: tudo exige sessão válida com `cliente_id` resolvido do token, nunca do body. Zero "porta lateral" pública pra nenhum artefato do cliente.

### 3. Esforço/risco de implementação
- **X = 3.** Segue à risca a decisão já "aprovada" (bucket público) — zero necessidade de reabrir essa decisão com o Wilke. Mas: schema tem 1 tabela a mais (`portal_login_attempts` além de `portal_sessions`); o próprio autor marca `ponytail:` avisando que o scan O(N) vai precisar de refatoração pra lookup indexado se a base crescer — ou seja, X nasce com dívida técnica já mapeada. E X não notou o botão de link morto em produção (`gestao/index.html:406`), que segue quebrado independente da proposta ser aceita.
- **Y = 4.** Schema mais enxuto (1 tabela nova, sem tabela de attempts). Faz o diagnóstico mais completo do risco real: acha e propõe correção pro link morto (página estática de aviso + rewrite + consertar o botão em `gestao/index.html`). Contrapontos reais: precisa de aprovação explícita do Wilke pra reverter "bucket público" do plano anterior (o enunciado pede exatamente essa decisão, então não é fora de escopo, mas é 1 passo de coordenação a mais); e assume hospedagem Vercel sem verificar (`vercel.json` proposto "assumindo... se não for, o equivalente resolve") — mesmo tipo de suposição não checada que penalizei em X, só que menor em escopo e declarada como suposição, não como fato.

### 4. Experiência do cliente final
- **X = 4.** Senha mais curta pra copiar/colar (10 chars, sem hífen) vs 13 de Y. Entrega um `/portal/index.html` **completo e funcional** (login + 4 abas + fetch calls reais), reduzindo trabalho residual de implementação. Marca abre em link público estável — dá pra mandar esse link pra gráfica/agência de mídia sem re-autenticar, sem expirar. `localStorage` mantém sessão entre fechamentos de navegador — cliente não-técnico não precisa relogar toda hora.
- **Y = 3.** Fluxo de marca é mais frágil pro caso de uso real ("cliente manda o logo pra gráfica"): signed URLs expiram em 5min, não dá pra compartilhar um link direto e persistente, cada visualização passa por 2 chamadas extras (`me` → `marca.asset_urls` pro manifest → `marca.asset_urls` pros assets). `sessionStorage` mata a sessão ao fechar a aba — cliente relogaria com frequência, digitando uma senha de 13 caracteres. O HTML da seção 7 é esboço incompleto (`montarPainel`, `FN_URL`, `#erro` referenciados mas não definidos) — mais trabalho de acabamento antes de ir pro ar.

### 5. Fit com o plano aprovado (admin_sessions/admin-auth)
- **Empate, X = 4, Y = 4.** As duas criam uma tabela de sessão separada (`portal_sessions`) com o mesmo padrão (`token` pk, `cliente_id` fk, sliding expiry, RLS habilitado sem policy, só service-role acessa) — e isso é o comportamento correto, não reinvenção: o próprio enunciado já observa que o modelo de ameaça do cliente é diferente do admin, então uma tabela de sessão própria é esperada, não duplicação preguiçosa. Nenhuma nota 5 porque `admin_sessions`/`admin-auth` (o "precedente") ainda não existe em produção — é plano, não fato construído — então "encaixar no precedente" é, tecnicamente, encaixar num desenho também não implementado ainda.

## Furos concretos, resumo rápido

**Proposta X**
1. Justificativa central pra marca pública (preservar link já em uso) é factualmente falsa — não há link nem bucket em produção hoje.
2. Slug de marca sem qualquer autenticação = qualquer um que adivinhe/receba o nome do cliente vê os arquivos dele.
3. PBKDF2 a 100k iterações, abaixo do padrão OWASP, escolhido pra acomodar um scan que o próprio autor já sabe que não escala.
4. Rate-limit só por IP não trava a conta-alvo — restrição 3 do enunciado pede defesa contra "adivinhar a senha de outro cliente específico", e X não entrega isso.
5. Não percebeu o botão de link morto já em produção (`gestao/index.html:406`).

**Proposta Y**
1. Lockout por conta pode ser usado pra negar acesso ao cliente legítimo (DoS contra a vítima) — não discutido.
2. Descoberta de prefixo (32^4 combinações) não tem throttle nenhum — mitigada só pelo custo computacional do PBKDF2, não por um limite explícito.
3. Assume hospedagem Vercel sem verificar, pra propor o rewrite do link morto.
4. Fluxo de marca via signed URL (5min) é mais frágil pro caso de uso real de compartilhar arquivo aprovado com terceiros (gráfica/agência) — o próprio tipo de artefato que menos precisa de fricção.
5. Sketch de front-end incompleto — falta código real de acabamento.

## Veredito

Na lente pedida (segurança/privacidade de dado real de cliente, sem inconsistência explorável), **Proposta Y vence com folga em consistência (2 vs 5) e leva vantagem real em segurança (iterações OWASP, lockout por conta, lookup O(1) sem custo crescente)** — e fez a investigação mais rigorosa, encontrando que a premissa de risco central de X é falsa. X compensa em experiência do cliente (marca pública é genuinamente mais prática pro fluxo real de "mandar pro gráfico") e leva vantagem marginal em não precisar reabrir uma decisão já "aprovada". Nenhuma das duas é perfeita — ambas deixam brecha de rate-limit global e nenhuma resolve de vez o trade-off marca-compartilhável vs marca-protegida —, mas dado o critério explícito de "proteger dado real sem criar inconsistência explorável", Y é o desenho mais defensável tecnicamente.


---

# Juiz 2 — ranking: Proposta Y — Tudo atrás do login (marca migra de pública para privada) > Proposta X — Portal mínimo, marca continua pública por fora

## Achado crítico que muda a moldura da pergunta (verificado agora, read-only)

O enunciado desta tarefa afirma como fato: *"Georgia Andrade já tem um link público de marca ativo hoje"*. Verifiquei isso agora, de novo, independentemente — e **não é verdade**, exatamente como a Proposta Y (seção 0) já havia levantado:

```sql
select id, name, public from storage.buckets order by id;
-- [{"id":"anexos","public":false},{"id":"eloi-notas","public":false}]
-- Não existe bucket "entregas-marca". Nenhum bucket público existe no projeto.

select id, nome, marca_slug, marca_publicada from public.eloi_clientes;
-- Georgia Andrade: marca_publicada = true, marca_slug = 'georgia-andrade'
```

`Glob` em `entregas-marca/**` no repo local não retornou nenhum arquivo — não existe `entregas-marca/index.html` nem nada equivalente. O que existe de fato é só o botão em `gestao/index.html:406-407` (`copiarLinkMarca`) que monta a string `${origin}/entregas-marca/${slug}/` e copia pra área de transferência — **uma URL para uma página que nunca foi construída**. Se esse link já foi copiado e mandado pro WhatsApp da Georgia em algum momento, ele levaria a um 404, não a uma página real.

**Consequência direta pra esta avaliação:** o critério "menos atrito real pro cliente já existente" não pode ser lido como "não quebrar um link que ela usa hoje", porque não há link nenhum em uso — há só uma *intenção* sinalizada no banco (`marca_publicada=true`) e um botão que gera um link morto. Isso não invalida a pergunta (ainda vale perguntar qual proposta é mais fácil de operar e mais consistente daqui pra frente), mas invalida a premissa específica que a Proposta X usa como principal justificativa para manter a marca pública ("não quebrar link em posse de terceiro") — não há nada em posse de ninguém pra quebrar. A Proposta Y é a única das duas que checou isso antes de desenhar em cima disso, e ajustou a análise de risco de acordo (ela mesma nota: "não estou migrando um link público real, estou implementando do zero").

Isso não torna a Proposta X errada — manter a marca pública por fora continua sendo uma decisão de produto legítima (facilita compartilhar arte-final aprovada com gráfica/agência sem senha) — mas o argumento de "evitar regressão" que ela usa pra justificar isso é, na prática, nulo hoje.

---

## Notas 1–5 por critério

| Critério | Proposta X (marca pública por fora) | Proposta Y (tudo atrás do login) |
|---|:-:|:-:|
| 1. Segurança real | **3** | **5** |
| 2. Consistência do modelo de privacidade | **2** | **5** |
| 3. Esforço/risco de implementação | **4** | **3** |
| 4. Experiência do cliente final | **4** | **3** |
| 5. Fit com plano aprovado (admin_sessions) | **4** | **4** |
| **Total** | **17** | **20** |

### 1. Segurança real
- **X = 3.** PBKDF2 correto (hash+salt nunca em claro, compare timing-safe), prevenção de colisão de senha na geração + defesa em profundidade no login. Mas o rate-limit é **só por IP** (10 tentativas/15min) — a própria proposta admite explicitamente o trade-off: "um atacante trocando de IP escapa do rate-limit". Isso deixa a ameaça central da restrição 3 do enunciado ("QUALQUER cliente tentar adivinhar a senha de outro cliente") só parcialmente coberta — um atacante com poucas IPs/proxies rotativos não encontra nenhuma trava de conta. Login também é O(N) PBKDF2 por tentativa (scan linear), e a própria proposta documenta que isso força baixar iterações (hoje 100k) se a base crescer — é uma troca de segurança por escala que o desenho já sabe que vai precisar pagar.
- **Y = 5.** PBKDF2 a 600k iterações (padrão OWASP, sem trade-off de escala porque o lookup é O(1) por prefixo indexado), hash com verificação contra `DUMMY_HASH` quando o prefixo não bate (fecha o timing leak "prefixo existe vs não existe"), e **lockout por conta** (5 tentativas → 15min), que é a defesa que realmente neutraliza um atacante rotacionando IP contra uma conta específica — o cenário que a restrição 3 do enunciado descreve literalmente. Unicidade de prefixo é garantida por `unique` no banco, não só por checagem otimista em runtime.

### 2. Consistência do modelo de privacidade
- **X = 2.** A própria proposta é honesta sobre isso ("2 regras diferentes coexistindo, não fica mais segura, fica mais descobrível") — o que é ótimo como transparência, mas o critério pede justamente ausência de meio-termo confuso, e X preserva o meio-termo por decisão explícita.
- **Y = 5.** Uma regra só: tudo que é arquivo do cliente exige sessão válida, sem exceção. É exatamente o que este critério pede.

### 3. Esforço/risco de implementação
- **X = 4.** Reaproveita `nf.view_url` 1:1, não precisa de bucket novo nem de signed URL pra marca — zero código novo nesse pedaço. Migração de `cliente_id` é idêntica nas duas propostas.
- **Y = 3.** Mesma migração de `cliente_id`, mas soma bucket privado novo, ação `marca.asset_urls` com checagem de trust-boundary (path prefixado por `marca_slug`), fetch client-side de signed URLs em vez de `<img src>` direto, **mais** uma página de aviso pro link morto e um rewrite de host (`vercel.json`) cuja premissa de hospedagem é assumida, não confirmada ("assumindo hospedagem Vercel"). É mais peça em movimento, mesmo que o risco de "quebrar link real" tenha se mostrado moot pela verificação acima.

### 4. Experiência do cliente final (não-técnico)
- **X = 4.** Marca abre sem login, o que é genuinamente melhor pro caso de uso recorrente "cliente encaminha o logo pro gráfico/agência" sem precisar compartilhar senha. Fluxo mais curto pra essa tarefa específica.
- **Y = 3.** Um único login pra tudo é um modelo mental mais simples de explicar ("essa senha abre tudo"), mas qualquer visualização de marca exige sessão + resolução de signed URLs (mais uma etapa de carregamento, mais uma superfície de erro se a sessão expirar no meio). Pra Georgia especificamente, se ela precisar repassar arquivos de marca pra terceiros, agora precisaria repassar a própria senha do portal — pior nesse ponto específico.

### 5. Fit com o resto do plano aprovado
- **Ambas = 4.** As duas reaproveitam literalmente o mesmo padrão de sessão do `admin_sessions` (token pk, `created_at`/`last_seen_at`/`expires_at` deslizante, mesma janela de 12h) e o mesmo padrão de dispatch por `action` das edge functions já existentes (`eloi-gestao`). Nenhuma inventa um terceiro jeito de fazer sessão. Empate real, sem diferença que justifique separar nota aqui.

---

## Leitura pra continuidade de negócio (a lente pedida)

Como não existe hoje nenhum link público de marca funcionando de verdade (só a intenção no banco + um botão que gera 404), **não há atrito real de transição pra proteger em nenhuma das duas propostas** — essa parte do enunciado partia de uma premissa que a checagem derrubou. Sobrou então a pergunta que efetivamente decide: qual é mais fácil do Wilke operar no dia a dia com poucos clientes, e qual dá menos superfície de erro.

Nesse recorte, **Y ganha**: um único fluxo ("gero sua senha, mando por WhatsApp, você vê tudo") é mais simples de explicar e operar do que o de X, que obriga o Wilke a manter dois sistemas de acesso mentalmente separados (o link de marca sem senha de sempre + a senha nova do portal para o resto) — e ainda decidir, por cliente, quando/se atualizar o botão antigo. Y também fecha melhor a ameaça de adivinhação de senha que o enunciado pede explicitamente para tratar (lockout por conta bate o alvo; X só reduz o problema, não fecha).

A única coisa real que se perde ao escolher Y é a conveniência de repassar arte-final pra terceiros (gráfica, agência de mídia) sem precisar da senha do portal — isso é uma decisão de produto genuína que vale confirmar com o Wilke antes de fechar, não um defeito do desenho Y.

## Ranking

1. **Proposta Y** — Tudo atrás do login (marca migra de pública para privada) — 20/25
2. **Proposta X** — Portal mínimo, marca continua pública por fora — 17/25

## Fontes consultadas nesta avaliação
- MCP Supabase (`nlamznxoocmygfvnqcns`, read-only): `execute_sql` em `storage.buckets` e `public.eloi_clientes` — confirma que não existe bucket `entregas-marca` (só `anexos` e `eloi-notas`, ambos privados) e que `marca_publicada=true` pra Georgia Andrade é só uma flag, sem infraestrutura pública por trás.
- `Glob` em `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\entregas-marca\**` — nenhum arquivo encontrado.
- `Grep` em `C:\Users\wilke\Documents\ELOI SITES\briefing-eloidesign-repo\gestao\index.html` — confirma `copiarLinkMarca()` (linhas 406-407) gerando URL para página inexistente.
