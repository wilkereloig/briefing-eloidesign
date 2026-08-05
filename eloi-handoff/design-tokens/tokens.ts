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
  texto: '#FDD5D3',
  texto2: 'rgba(253,213,211,.72)',
  texto3: 'rgba(253,213,211,.55)',
  texto4: 'rgba(253,213,211,.45)',
  textoOff: 'rgba(253,213,211,.35)',
  linha: 'rgba(253,213,211,.12)',
  linhaFraca: 'rgba(253,213,211,.07)',
  linhaForte: 'rgba(253,213,211,.28)'
} as const;

/** Par [fundo, texto] de cada estado de chip. Única fonte para etiquetas de estado. */
export const chip = {
  concluido: ['#DFF806', '#1B0647'],
  pago: ['#DFF806', '#1B0647'],
  aprovado: ['#DFF806', '#1B0647'],
  realizado: ['#DFF806', '#1B0647'],
  execucao: ['#5B7CFD', '#FFFFFF'],
  enviado: ['#5B7CFD', '#FFFFFF'],
  atrasado: ['#FD4400', '#FFFFFF'],
  fila: ['rgba(253,213,211,.12)', '#FDD5D3'],
  aberto: ['rgba(253,213,211,.12)', '#FDD5D3'],
  previsto: ['rgba(253,213,211,.12)', '#FDD5D3'],
  rascunho: ['rgba(253,213,211,.12)', '#FDD5D3']
} as const satisfies Record<string, readonly [string, string]>;

/** Cor identificadora de cliente, na ordem em que devem ser distribuídas. */
export const corCliente = ['#7D2AE8', '#DFF806', '#5B7CFD', '#EEB4E7', '#FD4400'] as const;

export const fonte = {
  titulo: "'Archivo', system-ui, sans-serif",
  corpo: "'Manrope', system-ui, sans-serif",
  marcaWdth: 72,
  tituloWdth: 100
} as const;

export const espaco = { 1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 14, 7: 16, 8: 20, 9: 26, 10: 32, 11: 40, 12: 56 } as const;

export const raio = { controle: 10, chip: 8, card: 14, painel: 16, bloco: 18, folha: 22, etiqueta: 999 } as const;

export const movimento = {
  micro: 140,
  padrao: 260,
  folha: 280,
  curva: 'cubic-bezier(.4,0,.2,1)',
  curvaFolha: 'cubic-bezier(.32,0,.24,1)',
  curvaMarca: 'cubic-bezier(.72,0,.16,1)'
} as const;

export const quebra = { celPequeno: 360, celPadrao: 390, celGrande: 430, tablet: 768, notebook: 1024, desktop: 1280, ampla: 1600 } as const;

export type EstadoChip = keyof typeof chip;
