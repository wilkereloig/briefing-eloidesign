// "Hoje" do estúdio é o de Brasília, não o do UTC. `toISOString()` devolve a
// data em UTC: depois das 21h em São Paulo ela já é amanhã, e o painel passava
// a ver vencido o que vence hoje e a abrir no mês seguinte no último dia.
// Fonte única de "hoje" e "mês corrente" — tela e domínio leem daqui.
const FUSO = 'America/Sao_Paulo'

// en-CA formata como AAAA-MM-DD, o mesmo formato das colunas date do banco.
const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Data de hoje em Brasília, 'AAAA-MM-DD'. `agora` entra para teste. */
export const hojeISO = (agora: number | Date = Date.now()) => DIA.format(agora)

/** Mês corrente em Brasília, 'AAAA-MM'. */
export const mesAtual = (agora: number | Date = Date.now()) => hojeISO(agora).slice(0, 7)

/** Dias de `de` até `ate` (ambos 'AAAA-MM-DD'). Negativo = `ate` já passou. */
export const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000)
