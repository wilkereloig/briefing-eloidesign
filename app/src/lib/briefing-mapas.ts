// Dicionários de resposta de briefing, portados de `painel-briefings/index.html`
// sem mudar um rótulo: são os mesmos textos que o dono já lê há meses, e
// renomear "Nº produtos" para outra coisa só criaria dúvida sobre se é o
// mesmo campo.
//
// Enquanto `/painel-briefings` existir, os dois arquivos convivem. Condição
// de saída do HTML: o painel estático sair do ar.

/** campo → { valor cru → rótulo legível }. Multi-escolha vem separada por vírgula. */
export type MapaValores = Record<string, Record<string, string>>

export interface Secao { titulo: string; campos: string[] }

/** Tipos de briefing que têm formulário publicado. */
export const TIPOS_BRIEFING: { chave: string; label: string; caminho: string }[] = [
  { chave: 'briefing', label: 'Identidade visual', caminho: '/briefing/' },
  { chave: 'briefing-ecommerce', label: 'E-commerce', caminho: '/briefing-ecommerce/' },
  { chave: 'briefing-solarium', label: 'E-commerce (Solarium)', caminho: '/briefing-solarium/' },
  { chave: 'briefing-guia-viver-bem', label: 'Guia Viver Bem', caminho: '/briefing-guia-viver-bem/' },
]

export const rotuloTipo = (tipo: string) =>
  TIPOS_BRIEFING.find((t) => t.chave === tipo)?.label ?? tipo

export const caminhoTipo = (tipo: string) =>
  TIPOS_BRIEFING.find((t) => t.chave === tipo)?.caminho ?? '/'

/** Solarium usa o mesmo formulário do e-commerce, com outra marca na capa. */
const ehEcommerce = (tipo: string) =>
  tipo === 'briefing-ecommerce' || tipo === 'briefing-solarium'

export const VALORES_ECOMMERCE: MapaValores = {
  ec_n_produtos:{'1-10':'1 a 10','11-50':'11 a 50','51-200':'51 a 200','201-1000':'201 a 1.000','1000+':'Mais de 1.000'},
  ec_variacao:{sim:'Sim, a maioria',algumas:'Algumas',nao:'Produto simples'},
  ec_catalogo_muda:{muito:'Muda muito',as_vezes:'De vez em quando',raro:'Quase fixo'},
  ec_faturamento:{ate_5k:'Até R$ 5 mil','5-20k':'R$ 5–20 mil','20-50k':'R$ 20–50 mil','50-100k':'R$ 50–100 mil','100k+':'+R$ 100 mil',prefiro_nao:'Não informou'},
  ec_mercado:{brasil:'Só Brasil',brasil_exterior:'Brasil + exterior'},
  ec_identidade:{sim:'Marca pronta',parcial:'Só logo/parcial',nao:'Não tem'},
  ec_fotos:{profissionais:'Profissionais',amador:'Amadoras',nao:'Não tem'},
  ec_verba:{ate_3k:'Até R$ 3 mil','3-7k':'R$ 3–7 mil','7-15k':'R$ 7–15 mil','15k+':'+R$ 15 mil',conversar:'Conversar'},
  ec_aceita_mensalidade:{sim:'Sim, se valer',depende:'Depende',nao:'Quer barato'},
  ec_manutencao:{cliente:'Cliente/equipe',eloi:'Quer ELOI',indefinido:'Não sabe'},
  ec_publico_b2b:{b2b:'B2B — salões (foco)',consumidor:'Consumidor final',ambos:'Ambos'},
  ec_plataforma_decisao:{manter:'Manter e otimizar',aberto:'Aberto a migrar',migrar:'Quer migrar',nao_sei:'Precisa orientação'},
  ec_frete_real:{sempre:'Sempre grátis',condicional:'Grátis em condições',pago:'Na real é pago',rever:'Precisa revisar'},
  ec_email_dominio:{sim:'Tem no domínio',nao:'Usa Gmail',quero:'Quer passar a ter'},
  ec_catalogo_completo:{sim:'Organizado',parcial:'Mais ou menos',nao:'Não'},
  ec_crm:{sim:'Base organizada',lista:'Só lista/WhatsApp',nao:'Não tem'}
};
export const ROTULOS_ECOMMERCE: Record<string, string> = {
  ec_oque_vende:'O que vende',ec_n_produtos:'Nº produtos',ec_variacao:'Variações',ec_catalogo_muda:'Frequência catálogo',ec_ticket:'Ticket médio',ec_faturamento:'Faturamento/mês',ec_mercado:'Mercado',ec_marketplaces:'Marketplaces',
  ec_plataforma_atual:'Plataforma atual',ec_plataforma_decisao:'Decisão de plataforma',ec_tempo:'Tempo de uso',ec_dores:'Dores hoje',ec_dores_outro:'Outra dor',ec_nao_consegue:'O que não consegue',ec_custo_atual:'Custo mensal',ec_site_url:'Link da loja',
  ec_pagamento:'Pagamento',ec_pagamento_outro:'Pagamento (outro)',ec_frete:'Frete',ec_frete_outro:'Frete (outro)',ec_erp:'NF/Estoque',ec_erp_outro:'ERP (outro)',ec_marketing:'Marketing/Ads',ec_atendimento:'Atendimento',ec_atendimento_outro:'Atend. (outro)',ec_quer_integrar:'Quer integrar',ec_sonho:'Recursos dos sonhos',ec_sonho_outro:'Sonho (outro)',
  ec_publico_b2b:'Público prioritário',ec_objetivo_foco:'Foco da reestruturação',ec_frete_real:'Frete grátis (real?)',ec_email_dominio:'E-mail no domínio',ec_quem_cadastra:'Quem cadastra produtos',ec_catalogo_completo:'Catálogo/fornecedores',ec_crm:'CRM/base',ec_mkt_disparo:'Disparo e-mail/Whats',ec_metas:'Metas & prazo',
  ec_identidade:'Identidade visual',ec_referencias:'Referências',ec_fotos:'Fotos',ec_objetivo:'Objetivo',ec_prazo:'Prazo',ec_verba:'Verba',ec_aceita_mensalidade:'Aceita mensalidade maior',ec_manutencao:'Quem mantém',ec_obs:'Observações'
};
export const SECOES_ECOMMERCE: Secao[] = [
  { titulo:'Posicionamento & Negócio', campos:['ec_publico_b2b','ec_objetivo_foco','ec_oque_vende','ec_n_produtos','ec_variacao','ec_catalogo_muda','ec_ticket','ec_faturamento','ec_mercado','ec_marketplaces'] },
  { titulo:'Loja atual & Plataforma', campos:['ec_site_url','ec_plataforma_atual','ec_plataforma_decisao','ec_tempo','ec_dores','ec_dores_outro','ec_nao_consegue','ec_custo_atual'] },
  { titulo:'Operação & Integrações', campos:['ec_frete_real','ec_email_dominio','ec_quem_cadastra','ec_catalogo_completo','ec_crm','ec_mkt_disparo','ec_pagamento','ec_pagamento_outro','ec_frete','ec_frete_outro','ec_erp','ec_erp_outro','ec_marketing','ec_atendimento','ec_atendimento_outro','ec_quer_integrar','ec_sonho','ec_sonho_outro'] },
  { titulo:'Marca, objetivo & verba', campos:['ec_identidade','ec_referencias','ec_fotos','ec_objetivo','ec_metas','ec_prazo','ec_verba','ec_aceita_mensalidade','ec_manutencao','ec_obs'] }
];


export const VALORES_IDENTIDADE: MapaValores = {
  q12:{criacao:'Empresa nova',rebranding:'Rebranding',atualizacao:'Atualização de logo'},
  q13:{sim:'Sim',nao:'Não',em_processo:'Em processo'},
  q14:{sim:'Sim',nao:'Não',em_processo:'Em processo',nao_sei:'Não sabe'},
  q15:{sim:'Sim',nao:'Não',nao_sei:'Não sabe'},
  q16:{sim:'Sim',nao:'Não',sem_site:'Não tem site'},
  q17:{todas:'Em todas',algumas:'Em algumas',nao:'Não'}
};
export const ROTULOS_IDENTIDADE: Record<string, string> = {
  q1:'Empresa/marca',q2:'O que faz',q3:'Missão e valores',q4:'Cliente ideal',q5:'Onde o público está',q6:'Concorrentes',q7:'Diferencial',q8:'Personalidade',q9:'Sentimento',
  q10_descricao:'Referências',q10_link:'Links',q11_cores:'Cores a evitar',q11_texto:'Estilos a evitar',
  q12:'Tipo de projeto',q13:'CNPJ registrado',q14:'INPI',q15:'Anterioridade',q16:'Domínio',q17:'Redes sociais',q18:'Serviços',q18_outro:'Outro'
};
export const SECOES_IDENTIDADE: Secao[] = [
  { titulo:'Sobre o negócio', campos:['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10_descricao','q10_link','q11_cores','q11_texto','q12'] },
  { titulo:'Registro & legal', campos:['q13','q14','q15','q16','q17'] },
  { titulo:'Serviços', campos:['q18','q18_outro'] }
];

/** Traduz um valor cru. Multi-escolha vem por vírgula; chave desconhecida
 *  passa direto — resposta velha com opção que não existe mais continua legível. */
export function traduzirValor(mapa: MapaValores, campo: string, cru: unknown): string {
  if (cru == null || cru === '') return ''
  const m = mapa[campo]
  const texto = String(cru)
  if (!m) return texto
  return texto.split(',').map((s) => s.trim()).map((s) => m[s] ?? s).join(', ')
}

export interface LinhaResposta { campo: string; rotulo: string; valor: string }
export interface BlocoResposta { titulo: string; linhas: LinhaResposta[] }

/**
 * Resposta pronta para desenhar, agrupada em seções.
 *
 * Tipo sem dicionário (hoje `briefing-guia-viver-bem`, que grava a pergunta
 * inteira em português como chave) cai numa seção única com as chaves do
 * próprio JSON. Antes disso, aquele briefing existia no banco e **nenhum
 * painel conseguia exibir** — tudo virava travessão.
 */
export function lerResposta(tipo: string, raw: unknown): BlocoResposta[] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const comMapa = ehEcommerce(tipo) || tipo === 'briefing'
  if (!comMapa) {
    const linhas = Object.entries(r)
      .filter(([k]) => !CAMPOS_DE_CONTATO.includes(k))
      .map(([campo, v]) => ({ campo, rotulo: campo, valor: v == null ? '' : String(v) }))
    return linhas.length ? [{ titulo: 'Respostas', linhas }] : []
  }
  const ecom = ehEcommerce(tipo)
  const rotulos = ecom ? ROTULOS_ECOMMERCE : ROTULOS_IDENTIDADE
  const valores = ecom ? VALORES_ECOMMERCE : VALORES_IDENTIDADE
  const secoes = ecom ? SECOES_ECOMMERCE : SECOES_IDENTIDADE
  return secoes.map((s) => ({
    titulo: s.titulo,
    linhas: s.campos.map((campo) => ({
      campo,
      rotulo: rotulos[campo] ?? campo,
      valor: traduzirValor(valores, campo, r[campo]),
    })),
  }))
}

/** Já aparecem no cabeçalho da ficha; repetir no corpo é ruído. */
const CAMPOS_DE_CONTATO = ['nome', 'email', 'whatsapp', 'empresa']
