/* ============================================================
   Entrega de marca — renderer global (serve todas as entregas)
   Lê ./manifest.json, deriva a identidade visual da própria paleta
   do cliente e monta a página. Nenhum cliente hardcoded.
   ============================================================ */
(async function () {
  const res = await fetch("./manifest.json", { cache: "no-store" });
  const m = await res.json();

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ── ícones (inline, sem dependência) ──────────────────
  const IC = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  };
  const corSlug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // ── deriva papéis de cor da própria paleta do cliente ──
  const claros = m.paleta.filter((c) => c.claro);
  const escuros = m.paleta.filter((c) => !c.claro);
  const bg = claros[0]?.hex || "#f5f2ec";
  const bg2 = claros[1]?.hex || bg;
  const ink = escuros[0]?.hex || "#272126";
  const accent = escuros[1]?.hex || ink;

  // mistura hex→hex (para texto suave sobre o fundo)
  const mix = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
    return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
  };
  const inkSoft = mix(ink, bg, 0.42);

  const root = document.documentElement.style;
  root.setProperty("--brand-bg", bg);
  root.setProperty("--brand-bg-2", bg2);
  root.setProperty("--brand-ink", ink);
  root.setProperty("--brand-ink-soft", inkSoft);
  root.setProperty("--brand-accent", accent);
  root.setProperty("--brand-line", mix(ink, bg, 0.86));
  root.setProperty("--brand-card", mix(bg, "#ffffff", 0.55));

  document.title = `${m.marca} · Arquivos da marca`;

  const byId = (id) => m.variacoes.find((v) => v.id === id);
  const completa = byId("completa") || m.variacoes[0];
  const simbolo = byId("simbolo");
  const heroSvg = completa?.arquivos[ink]?.svg;
  const markSvg = (simbolo || completa)?.arquivos[ink]?.svg;
  const zipHref = `./${m.slug}-marca-completa.zip`;
  const apres = m.apresentacao;

  const nVar = m.variacoes.length;
  const nCor = m.paleta.length;
  const nArq = m.variacoes.reduce((s, v) => s + Object.keys(v.arquivos || {}).length, 0) * 2; // svg + png

  // ── swatches de uma variação ──────────────────────────
  const swatchesHtml = (v) =>
    m.paleta
      .map((cor) => {
        const f = v.arquivos[cor.hex];
        if (!f) return "";
        const previewBg = cor.claro ? ink : mix(bg, "#ffffff", 0.7);
        const fundo = cor.claro ? ink : bg; // fundo contrastante da própria paleta
        const nomeFundo = `${m.slug}-${v.id}-${corSlug(cor.nome)}-fundo.png`;
        return `
        <div class="swatch">
          <div class="preview" style="background:${previewBg}">
            <img src="./${esc(f.preview)}" alt="${esc(v.nome)} — ${esc(cor.nome)}" loading="lazy">
          </div>
          <div class="info">
            <p class="nm"><span class="sw-dot" style="background:${esc(cor.hex)}"></span>${esc(cor.nome)}</p>
            <div class="dl">
              <a href="./${esc(f.svg)}" download>${IC.download} SVG</a>
              <a href="./${esc(f.png)}" download>${IC.download} PNG</a>
            </div>
            <button class="dl-bg" onclick="baixarComFundo('./${esc(f.png)}','${fundo}','${esc(nomeFundo)}')">${IC.image} PNG com fundo</button>
          </div>
        </div>`;
      })
      .join("");

  // ── tipografia (opcional, vem do manifest) ────────────
  const tipoHtml = (m.tipografia || [])
    .map(
      (t) => `
      <div class="tipo-card">
        <div class="tipo-specimen" style="font-family:${t.cssFamily}">
          <span class="tipo-aa">Aa</span>
          <span class="tipo-sample">${esc(t.amostra || "")}</span>
        </div>
        <div class="tipo-body">
          <div class="tipo-head">
            <h3 style="font-family:${t.cssFamily}">${esc(t.nome)}</h3>
            <span class="tipo-role">${esc(t.papel || "")}</span>
          </div>
          <div class="tipo-alpha" style="font-family:${t.cssFamily}">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz 0123456789</div>
          <div class="tipo-weights">${(t.pesos || []).map((p) => `<span class="wt" style="font-family:${t.cssFamily}">${esc(p)}</span>`).join("")}</div>
          <div class="tipo-meta">
            <span class="tipo-origem">${IC.info}${esc(t.origem || "")}</span>
            <p class="tipo-lic">${esc(t.licenca || "")}</p>
          </div>
          ${t.link ? `<a class="btn tipo-btn" href="${esc(t.link)}" target="_blank" rel="noopener">${esc(t.acao || "Obter fonte")} ↗</a>` : ""}
        </div>
      </div>`
    )
    .join("");

  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="hero">
      ${markSvg ? `<div class="watermark"><img src="./${esc(markSvg)}" alt=""></div>` : ""}
      <div class="hero-inner">
        <div class="kicker"><span class="dot"></span>ELOI Design Studio · Entrega de marca</div>
        ${heroSvg ? `<img class="logo-completa" src="./${esc(heroSvg)}" alt="${esc(m.marca)}">` : `<h1>${esc(m.marca)}</h1>`}
        <p class="lead">Todos os arquivos oficiais da sua marca, prontos para usar — em vetor e alta resolução, em cada versão e cor da identidade.</p>
        <div class="hero-meta">
          <span class="chip-count">${IC.layers}<b>${nVar}</b>&nbsp;versões</span>
          <span class="chip-count">${IC.palette}<b>${nCor}</b>&nbsp;cores</span>
          <span class="chip-count">${IC.file}<b>${nArq}</b>&nbsp;arquivos</span>
        </div>
      </div>
    </header>

    <div class="wrap">
      <section>
        <div class="cta-grid">
          <div class="zip-cta">
            <div class="zt">
              <p class="cta-eyebrow" style="color:var(--brand-bg)">${IC.package} Pacote completo</p>
              <h3>Baixar tudo de uma vez</h3>
              <p>Um único .zip com todas as versões, todas as cores, em SVG + PNG.</p>
            </div>
            <a class="btn btn-light" href="${esc(zipHref)}" download>${IC.download} Baixar .zip</a>
          </div>
          ${apres ? `
          <div class="doc-cta">
            <div class="zt">
              <p class="cta-eyebrow">${IC.book} ${esc(apres.formato || "PDF")}</p>
              <h3>${esc(apres.nome || "Apresentação da marca")}</h3>
              <p>A apresentação completa da identidade${apres.tamanho ? ` · ${esc(apres.tamanho)}` : ""}.</p>
            </div>
            <a class="btn btn-dark" href="./${esc(apres.arquivo)}" download>${IC.download} Baixar apresentação</a>
          </div>` : ""}
        </div>
      </section>

      <section>
        <div class="sec-head">
          <p class="eyebrow">${IC.palette} Paleta</p>
          <h2>As cores da marca</h2>
          <p>Toque em qualquer cor para copiar o código HEX.</p>
        </div>
        <div class="paleta">
          ${m.paleta
            .map(
              (c) => `
            <button class="cor" onclick="copiarHex('${esc(c.hex)}')">
              <div class="fill" style="background:${esc(c.hex)}"></div>
              <div class="cor-meta">
                <p class="cor-nome">${esc(c.nome)}</p>
                <p class="cor-hex">${esc(c.hex.toUpperCase())}</p>
                <p class="cor-copy">Copiar HEX</p>
              </div>
            </button>`
            )
            .join("")}
        </div>
      </section>

      ${tipoHtml ? `
      <section>
        <div class="sec-head">
          <p class="eyebrow">${IC.type} Tipografia</p>
          <h2>As fontes da marca</h2>
          <p>As tipografias que dão voz à marca — onde obter cada uma e como aplicá-las.</p>
        </div>
        <div class="tipografia">${tipoHtml}</div>
      </section>` : ""}

      <section>
        <div class="sec-head">
          <p class="eyebrow">${IC.layers} Versões</p>
          <h2>Cada versão, em cada cor</h2>
          <p>Baixe a versão certa para cada aplicação — assinatura completa, horizontal, vertical, símbolo isolado e wordmark.</p>
        </div>
        ${m.variacoes
          .map(
            (v) => `
          <div class="variacao">
            <h3>${esc(v.nome)}</h3>
            <div class="swatches">${swatchesHtml(v)}</div>
          </div>`
          )
          .join("")}
      </section>

      <section>
        <div class="help">
          <div class="item">
            <h4>${IC.file} SVG ou PNG?</h4>
            <p>Use <b>SVG</b> para vetor (impressão, corte, qualquer tamanho, sem perder nitidez). Use <b>PNG</b> para telas, redes sociais e documentos — fundo transparente.</p>
          </div>
          <div class="item">
            <h4>${IC.sparkle} Fundo claro ou escuro?</h4>
            <p>Cores claras da paleta foram feitas para fundos escuros; as escuras, para fundos claros. A prévia de cada arquivo já mostra o contraste ideal.</p>
          </div>
          <div class="item">
            <h4>${IC.check} Pode repassar</h4>
            <p>Estes arquivos são seus. Repasse à gráfica, à agência ou a quem for produzir — a marca já está aprovada e pronta para uso.</p>
          </div>
        </div>
      </section>
    </div>

    <footer>
      ${markSvg ? `<img class="fmark" src="./${esc(markSvg)}" alt="">` : ""}
      <p>Marca desenvolvida por ELOI Design Studio.</p>
    </footer>

    <div class="toast" id="toast"></div>
  `;

  window.copiarHex = function (hex) {
    const t = document.getElementById("toast");
    const show = (msg) => { t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
    navigator.clipboard?.writeText(hex).then(() => show("Copiado: " + hex.toUpperCase())).catch(() => show(hex.toUpperCase()));
  };

  // Compõe a logo (PNG transparente) sobre um fundo de cor da paleta e baixa PNG.
  // Client-side (canvas) — assets são same-origin, sem taint. Nenhum arquivo extra no repo.
  window.baixarComFundo = function (src, bg, nome) {
    const t = document.getElementById("toast");
    const show = (msg) => { t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      const S = 2000, pad = 0.68;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const x = c.getContext("2d");
      x.fillStyle = bg;
      x.fillRect(0, 0, S, S);
      const scale = Math.min((S * pad) / img.width, (S * pad) / img.height);
      const w = img.width * scale, h = img.height * scale;
      x.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      c.toBlob(function (blob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        show("Baixando com fundo…");
      }, "image/png");
    };
    img.onerror = () => show("Erro ao gerar imagem.");
    img.src = src;
  };
})();
