(async function () {
  const res = await fetch("./manifest.json");
  const m = await res.json();

  document.title = `${m.marca} · Download da marca`;

  const app = document.getElementById("app");

  const completa = m.variacoes.find((v) => v.id === "completa") || m.variacoes[0];
  const heroCor = m.paleta.find((c) => !c.claro) || m.paleta[0];
  const heroSvg = completa.arquivos[heroCor.hex]?.svg;

  const zipHref = `./${m.slug}-marca-completa.zip`;

  const swatchesHtml = (v) =>
    m.paleta
      .map((cor) => {
        const f = v.arquivos[cor.hex];
        if (!f) return "";
        const bg = cor.claro ? "#20201d" : "#f3f1ec";
        return `
        <div class="swatch">
          <div class="preview" style="background:${bg}">
            <img src="./${f.preview}" alt="${v.nome} — ${cor.nome}">
          </div>
          <div class="meta">
            <p class="cor-nome">${cor.nome}</p>
            <div class="downloads">
              <a href="./${f.svg}" download>SVG</a>
              <a href="./${f.png}" download>PNG</a>
            </div>
          </div>
        </div>`;
      })
      .join("");

  app.innerHTML = `
    <header class="hero" style="background:${heroCor.hex}${heroCor.claro ? ";color:#20201d" : ";color:#fff"}">
      ${heroSvg ? `<img class="logo-full" src="./${heroSvg}" alt="${m.marca}">` : ""}
      <h1>${m.marca}</h1>
      <p>Arquivos oficiais da marca — identidade aprovada por ELOI Design</p>
    </header>

    <div class="zip-cta">
      <div>
        <strong>Baixar tudo</strong>
        <p>Todas as variações, todas as cores, SVG + PNG num único arquivo.</p>
      </div>
      <a class="btn" href="${zipHref}" download>Baixar .zip</a>
    </div>

    ${m.variacoes
      .map(
        (v) => `
      <section class="variacao">
        <h2>${v.nome}</h2>
        <div class="swatches">${swatchesHtml(v)}</div>
      </section>`
      )
      .join("")}

    <footer>Marca desenvolvida por ELOI Design Studio.</footer>
  `;
})();
