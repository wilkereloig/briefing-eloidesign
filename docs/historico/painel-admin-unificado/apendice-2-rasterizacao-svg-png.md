## TL;DR

**Recomendado: Canvas API 100% client-side** (data: URL → `<img>`/`OffscreenCanvas` → `drawImage` → `toBlob('image/png')`), com upload direto pro Supabase Storage reaproveitando o padrão de signed-upload-URL que o repo já usa no bucket `eloi-notas`. As opções (a) e (c) do briefing colapsam na mesma coisa: mesmo em "Canvas puro", alguém precisa subir os bytes finais pro Storage — e esse mecanismo já existe no código. Não há razão pra opção (b) (resvg-wasm em Supabase Edge Function) hoje.

## O SVG mestre real (evidência, não suposição)

Li `entregas-marca/georgia-andrade/logo/simbolo/grafite.svg` em `C:/Users/wilke/Documents/ELOI SITES/briefing-eloidesign-repo`. É um único `<path>` com fill fixo via `<style>.cls-1{fill:#272126}`, viewBox `407.48 x 574.74`, sem `<text>`, sem `<image>`, sem `<filter>`, sem `foreignObject`, sem fontes externas. Este arquivo é um output já recolorido (uma das variações "grafite" geradas pelo script), mas confirma o padrão real do pipeline: path único, fill chapado, geometria simples, exatamente como o briefing descreveu o master (`fill:currentColor`). Isso é decisivo: não estamos rasterizando SVG arbitrário — estamos rasterizando o caso mais simples que existe pra um `<canvas>` desenhar, o que descarta boa parte do risco que normalmente justificaria um renderizador de servidor tipo resvg.

## (a) Canvas API — verificação dos pontos de risco pedidos

**Tainted canvas — `data:` URL é seguro, sempre.** Confirmado via busca: "quando o mesmo SVG é referenciado via data URI, todos os browsers concordam em não taintar o canvas" (intent-to-ship do Chromium blink-dev, https://groups.google.com/a/chromium.org/g/blink-dev/c/JpA2vmA9XT8). Tainting só ocorre quando o conteúdo vem de **outra origem** sem CORS (MDN, https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image). `blob:` URL criada localmente via `new Blob([svgString])` também não tainta nesse cenário — o histórico de inconsistência entre engines (Chromium/WebKit vs Gecko) existe só para o caso nicho de `<foreignObject>` dentro do SVG referenciado por blob, que não se aplica aqui (nosso SVG não tem foreignObject). Decisão prática: usar `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgColored)}` — uma linha, sem precisar gerenciar `createObjectURL`/`revokeObjectURL`.

**Limite de resolução de canvas por navegador** (canvas-size/pqina.nl: https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/; Chromium bug 339725: https://bugs.chromium.org/p/chromium/issues/detail?id=339725): Chrome/Firefox toleram até 32.767px por lado; Safari desktop limita a área a ~16,7M px; iOS limita a 4096×4096. Como o admin é uso interno do Wilke, isso raramente é o gargalo — mas para robustez cross-browser, gerar no máximo ~4000px no lado maior é suficiente pra qualquer uso raster de logo (quem precisar de mais resolução usa o SVG entregue junto).

**Qualidade de anti-aliasing:** `drawImage` de uma `<img>` cujo `src` é SVG usa o mesmo rasterizador SVG nativo do navegador que desenha `<img src="logo.svg">` normalmente na tela — não é uma reamostragem própria do canvas. Para um path único com fill chapado, o resultado é idêntico ao SVG renderizado normalmente na página.

**35 PNGs em sequência sem travar a aba:** cada draw é um path simples, custo de CPU desprezível. `canvas.toBlob()`/`convertToBlob()` já é assíncrono, então o loop naturalmente cede o event loop entre iterações — não precisa de `requestAnimationFrame` nem `setTimeout` artificial.

## (b) resvg-wasm em Supabase Edge Function (Deno) — viável, mas desnecessária agora

Confirmado tecnicamente possível: Supabase documenta oficialmente uso de módulos WASM em Edge Functions, incluindo `WebAssembly.instantiate()` em runtime (https://supabase.com/docs/guides/functions/wasm), e suporta imports `npm:`/`jsr:` (https://supabase.com/docs/guides/functions/dependencies). `@resvg/resvg-wasm` já roda em runtimes de isolate equivalentes — Cloudflare Workers, Deno Deploy, Vercel Edge (dev.to, https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle). Limites da Edge Function (256MB memória, 2s CPU/request — https://supabase.com/docs/guides/functions/limits) folgam à vontade para um path único.

Ressalvas: o pacote `resvg-js` "nativo" mais comum usa addon FFI em Deno (`--allow-ffi`), que a Supabase Edge Runtime sandboxed não permite — só a build WASM pura (`@resvg/resvg-wasm`) serve. Implantar exige bundlar o binário `.wasm` como `static_files` no `config.toml` e build via Docker (CLI 2.7.0+) — uma peça de infra extra (versionar wasm binário, rebuildar função a cada deploy) para fazer algo que o navegador do Wilke já faz de graça, sem dependência nova.

## (c) Híbrido — não é uma opção separada, é o mesmo que (a)

Testei a premissa de que (a) e (c) seriam distintos. Não são: mesmo em "Canvas puro", os bytes finais do PNG precisam ser enviados ao Storage por algum caminho — e esse mecanismo (signed upload URL) já existe no repo, usado hoje pelo bucket `eloi-notas` para PDF de nota fiscal. Então "Canvas gera + edge function só recebe bytes prontos" já É a arquitetura de (a) quando você soma a etapa de upload que qualquer opção precisaria de qualquer forma.

## Recomendação final e justificativa

Canvas API client-side vence pela escada de simplicidade: é um recurso nativo da plataforma (equivalente a "native platform feature" antes de qualquer lib), zero dependência nova, zero mudança de arquitetura no servidor — a edge function só precisa (talvez) devolver a signed URL, exatamente como já faz hoje para notas fiscais. resvg-wasm adicionaria uma dependência wasm versionada, um pipeline de build Docker e uma peça de infra para resolver um problema que os masters SVG atuais (path único, fill chapado, sem filtro/texto/webfont) não têm.

**Risco principal / fallback:** se um master SVG futuro usar `filter` CSS complexo (blur, drop-shadow, blend modes) ou texto com webfont, a rasterização via `<img>`-em-canvas pode variar entre engines (Chromium/WebKit/Gecko não implementam todos os filtros SVG de forma idêntica). Hoje isso não existe nos masters do cliente (confirmado lendo `grafite.svg`) e o próprio requisito do cliente proíbe isso explicitamente ("sem filtro CSS complexo... sem texto, sem imagens externas, sem webfonts"). Se algum dia precisar: o fallback documentado é migrar só a etapa de rasterização (não o resto do pipeline: upload, editor de paleta, etc. continuam iguais) para `@resvg/resvg-wasm` numa Edge Function — já confirmado tecnicamente viável acima.

## Fontes citadas

- Supabase Docs — Using Wasm modules in Edge Functions: https://supabase.com/docs/guides/functions/wasm
- Supabase Docs — Edge Functions limits (256MB memória, 2s CPU): https://supabase.com/docs/guides/functions/limits
- Supabase Docs — Managing dependencies (npm:/jsr:): https://supabase.com/docs/guides/functions/dependencies
- Chromium blink-dev — SVG foreignObject/blob URL canvas tainting (data URI nunca tainta): https://groups.google.com/a/chromium.org/g/blink-dev/c/JpA2vmA9XT8
- MDN — Use cross-origin images in a canvas (regra geral de tainting): https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image
- pqina.nl — Canvas area/size limits por navegador: https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/
- Chromium bug 339725 — canvas max size (32767px Chrome/Firefox): https://bugs.chromium.org/p/chromium/issues/detail?id=339725
- dev.to — resvg-wasm em Cloudflare Workers/Deno Deploy/Vercel Edge: https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle
- GitHub thx/resvg-js — Deno via FFI nativo vs build WASM pura: https://github.com/thx/resvg-js

## Arquivos lidos (nenhum editado)

- `C:/Users/wilke/Documents/ELOI SITES/briefing-eloidesign-repo/entregas-marca/georgia-andrade/logo/simbolo/grafite.svg`

Nenhum arquivo de produção foi criado ou modificado — esta é apenas a saída de planejamento solicitada.