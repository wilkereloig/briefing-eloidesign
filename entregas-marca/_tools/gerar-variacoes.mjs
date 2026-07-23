// Gera variações de logo (SVG + PNG, todas as cores da paleta) a partir de
// SVGs mestre com `fill: currentColor` + escreve manifest.json + zip.
//
// Uso: node gerar-variacoes.mjs <config.json>
//      node gerar-variacoes.mjs <config.json> --upload --cliente-id=<uuid>
// Config de exemplo: ver config-georgia-andrade.json
//
// --upload publica tudo no bucket privado eloi-entregas (Supabase Storage),
// em <cliente-id>/marca/... -- exige SUPABASE_SERVICE_ROLE_KEY no ambiente
// (Supabase dashboard -> Project Settings -> API -> service_role secret).
// cliente-id é o id do cliente em /gestao/ (aba Clientes).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import archiver from "archiver";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Uso: node gerar-variacoes.mjs <config.json>");
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const { slug, cliente, marca, mastersDir, variacoes, paleta, pngWidth = 2000, tipografia = null, apresentacao = null } = config;

const outDir = path.resolve(import.meta.dirname, "..", slug);
const logoDir = path.join(outDir, "logo");

function slugify(nome) {
  return nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function gerarVariacao(v) {
  const masterPath = path.join(mastersDir, v.arquivo);
  const masterSvg = await readFile(masterPath, "utf8");
  if (!masterSvg.includes("fill: currentColor") && !masterSvg.includes("fill:currentColor")) {
    console.warn(`aviso: ${v.arquivo} não usa fill:currentColor — cores podem não aplicar`);
  }
  const dir = path.join(logoDir, v.id);
  await mkdir(dir, { recursive: true });

  const arquivos = {};
  for (const cor of paleta) {
    const corSlug = slugify(cor.nome);
    const svg = masterSvg.replace(/fill:\s*currentColor/g, `fill: ${cor.hex}`);
    const svgPath = path.join(dir, `${corSlug}.svg`);
    const pngPath = path.join(dir, `${corSlug}.png`);
    const previewPath = path.join(dir, `${corSlug}.preview.png`);
    await writeFile(svgPath, svg, "utf8");
    await sharp(Buffer.from(svg)).resize({ width: pngWidth }).png().toFile(pngPath);
    await sharp(Buffer.from(svg)).resize({ width: 480 }).png().toFile(previewPath);
    arquivos[cor.hex] = {
      svg: path.relative(outDir, svgPath).replace(/\\/g, "/"),
      png: path.relative(outDir, pngPath).replace(/\\/g, "/"),
      preview: path.relative(outDir, previewPath).replace(/\\/g, "/"),
    };
  }
  return { id: v.id, nome: v.nome, arquivos };
}

const manifest = {
  slug, cliente, marca,
  gerado_em: new Date().toISOString(),
  paleta,
  ...(tipografia ? { tipografia } : {}),
  ...(apresentacao ? { apresentacao } : {}),
  variacoes: await Promise.all(variacoes.map(gerarVariacao)),
};

await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// zip com tudo (logo/ inteiro) p/ botão "baixar tudo"
const zipPath = path.join(outDir, `${slug}-marca-completa.zip`);
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.glob("**/*", { cwd: logoDir, ignore: ["**/*.preview.png"] }, { prefix: "logo" });
  archive.finalize();
});

console.log(`Gerado: ${outDir}`);
console.log(`  ${manifest.variacoes.length} variações × ${paleta.length} cores × 2 formatos = ${manifest.variacoes.length * paleta.length * 2} arquivos`);
console.log(`  manifest.json + ${slug}-marca-completa.zip`);

// ── --upload: publica no bucket privado eloi-entregas (Supabase Storage) ──
const uploadFlag = process.argv.includes("--upload");
if (uploadFlag) {
  const clienteIdArg = process.argv.find((a) => a.startsWith("--cliente-id="));
  const clienteId = clienteIdArg ? clienteIdArg.split("=")[1] : null;
  const SUPA_URL = process.env.SUPABASE_URL || "https://nlamznxoocmygfvnqcns.supabase.co";
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = "eloi-entregas";

  if (!clienteId) { console.error("\n--upload precisa de --cliente-id=<uuid> (pega em /gestao/, aba Clientes)."); process.exit(1); }
  if (!SERVICE_KEY) { console.error("\nSUPABASE_SERVICE_ROLE_KEY não definida no ambiente -- upload cancelado."); process.exit(1); }

  async function put(relPath, absPath, contentType) {
    const buf = await readFile(absPath);
    const url = `${SUPA_URL}/storage/v1/object/${BUCKET}/${clienteId}/marca/${relPath}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": contentType, "x-upsert": "true" },
      body: buf,
    });
    if (!res.ok) throw new Error(`upload falhou (${relPath}): ${res.status} ${await res.text()}`);
    process.stdout.write(".");
  }

  console.log(`\nPublicando em eloi-entregas/${clienteId}/marca/ ...`);
  for (const v of manifest.variacoes) {
    for (const hex of Object.keys(v.arquivos)) {
      const f = v.arquivos[hex];
      await put(f.svg, path.join(outDir, f.svg), "image/svg+xml");
      await put(f.png, path.join(outDir, f.png), "image/png");
      await put(f.preview, path.join(outDir, f.preview), "image/png");
    }
  }
  await put("manifest.json", path.join(outDir, "manifest.json"), "application/json");
  await put(`${slug}-marca-completa.zip`, zipPath, "application/zip");
  console.log("\nPublicado. Cliente já pode ver em /portal/ (aba Marca).");
}
