// ELOI Studio — tokens tipados. Espelha design-tokens.json e variables.css.
// Use para valores que precisam existir em JS (gráficos, cálculos de cor de chip).
// Para estilo em CSS, prefira as variáveis de variables.css.

export const cor = {
  pagina: '#08011A',
  chao: '#0D0225',
  chao2: '#170B33',
  chao3: '#20114A',
  roxo: '#7D2AE8',
  roxoHover: '#6A1FD0',
  roxoPress: '#5A17B0',
  roxoClaro: '#9184D9',
  lima: '#DFF806',
  coral: '#FD4400',
  lilas: '#EEB4E7',
  azul: '#5B7CFD',
  rosa: '#FDD5D3',
  tinta: '#1B0647',
  marinho: '#0A0A60',
  ambar: '#F5A300',
  texto: '#FDD5D3',
  texto2: 'rgba(253,213,211,.68)',
  texto3: 'rgba(253,213,211,.45)',
  texto4: 'rgba(253,213,211,.45)',
  textoOff: 'rgba(253,213,211,.35)',
  linha: 'rgba(253,213,211,.16)',
  linhaFraca: 'rgba(253,213,211,.08)',
  linhaForte: 'rgba(253,213,211,.28)'
} as const;

/** Par [fundo, texto] de cada estado de chip. Única fonte para etiquetas de estado.
 *  Regra: fundo a 14% da cor + texto na cor cheia. Exceção: sucesso/sinal usam
 *  fundo cheio com texto Tinta, porque Lima a 14% não se lê.
 *  `atrasado` é a segunda exceção: o fundo é Coral a 14%, mas o texto fica em
 *  Rosa — Coral como texto sobre escuro só a partir de 24px, e o chip tem 12px.
 *  Quem carrega a cor ali é o ícone (regra em componentes.css). */
export const chip = {
  concluido: ['#DFF806', '#1B0647'],
  pago: ['#DFF806', '#1B0647'],
  aprovado: ['#DFF806', '#1B0647'],
  realizado: ['#DFF806', '#1B0647'],
  execucao: ['rgba(91,124,253,.14)', '#5B7CFD'],
  enviado: ['rgba(91,124,253,.14)', '#5B7CFD'],
  aguardando: ['rgba(245,163,0,.14)', '#F5A300'],
  parcial: ['rgba(245,163,0,.14)', '#F5A300'],
  atrasado: ['rgba(253,68,0,.14)', '#FDD5D3'],
  fila: ['rgba(253,213,211,.14)', '#FDD5D3'],
  aberto: ['rgba(253,213,211,.14)', '#FDD5D3'],
  previsto: ['rgba(253,213,211,.14)', '#FDD5D3'],
  rascunho: ['rgba(253,213,211,.14)', '#FDD5D3']
} as const satisfies Record<string, readonly [string, string]>;

/** Ícone de cada estado — cor nunca informa sozinha: é cor + ícone + texto. */
export const chipIcone = {
  concluido: 'ok', pago: 'ok', aprovado: 'ok', realizado: 'ok',
  execucao: 'execucao', enviado: 'entrega',
  aguardando: 'pendente', parcial: 'pendente',
  atrasado: 'alerta',
  fila: 'pendente', aberto: 'pendente', previsto: 'pendente', rascunho: 'info'
} as const satisfies Record<keyof typeof chip, string>;

/** Cor identificadora de cliente, na ordem em que devem ser distribuídas. */
export const corCliente = ['#7D2AE8', '#DFF806', '#5B7CFD', '#EEB4E7', '#FD4400'] as const;

export const fonte = {
  titulo: "'Archivo', system-ui, sans-serif",
  corpo: "'Manrope', system-ui, sans-serif",
  marcaWdth: 72,
  tituloWdth: 100
} as const;

export const espaco = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 40, 8: 48, 9: 64, 10: 80, 11: 96, 12: 120 } as const;

export const raio = { minimo: 6, controle: 10, chip: 8, cartao: 14, painel: 16, bloco: 18, folha: 16, etiqueta: 999 } as const;

export const movimento = {
  rapido: 140,
  padrao: 240,
  lento: 420,
  apresentacao: 670,
  curvaPadrao: 'cubic-bezier(.3,0,.2,1)',
  curvaEntrada: 'cubic-bezier(.16,1,.3,1)',
  curvaSaida: 'cubic-bezier(.5,0,.75,0)',
  curvaAssinatura: 'cubic-bezier(.72,0,.16,1)'
} as const;

export const quebra = { celPequeno: 360, celPadrao: 390, celGrande: 430, tablet: 768, notebook: 1024, desktop: 1280, ampla: 1600 } as const;

export type EstadoChip = keyof typeof chip;
