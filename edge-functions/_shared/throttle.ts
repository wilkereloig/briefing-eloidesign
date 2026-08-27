// Decisão de throttle do login administrativo, separada da edge para ser
// testável sem rede e sem banco: quem chama lê os contadores e passa os
// números; aqui só se decide.
//
// Por que POR IP e não global (2026-08-07): admin_login_seguranca contava as
// falhas numa linha única e bloqueava o login inteiro por 15 minutos a partir
// da 5ª. Como a function responde a qualquer requisição da internet, isso era
// um botão de derrubar o painel — cinco POSTs com senha errada, de qualquer
// lugar, e o dono ficava de fora. Contador por IP barra o atacante sem trancar
// a porta de quem sabe a senha.

/** Janela de contagem. Mesma do portal (portal-cliente.ts). */
export const JANELA_MS = 15 * 60_000;

/** Tentativas por IP na janela. Baixo: força bruta de um só lugar morre aqui. */
export const LIMITE_IP = 5;

/**
 * Tentativas somadas de TODOS os IPs na janela. Alto de propósito: é rede de
 * segurança contra abuso distribuído, não controle de acesso. Baixo demais e
 * volta a ser o problema que esta mudança resolve — bastaria um punhado de IPs
 * para trancar o dono do lado de fora.
 */
export const LIMITE_GLOBAL = 300;

export type MotivoBloqueio = "ip" | "global";

/** `null` = pode tentar. Qualquer outro valor = 429, com o motivo para o log. */
export function avaliarTentativa(
  tentativasDoIp: number,
  tentativasNoTotal: number,
): MotivoBloqueio | null {
  if (tentativasDoIp >= LIMITE_IP) return "ip";
  if (tentativasNoTotal >= LIMITE_GLOBAL) return "global";
  return null;
}
