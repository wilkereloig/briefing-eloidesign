import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * "Novo cliente" na busca global tem que **abrir** o formulário, não só levar
 * até a tela — senão o atalho economiza um clique e cobra outro. O comando
 * navega com `?novo=1` e a tela de destino chama isto.
 *
 * O parâmetro é consumido na hora (`replace`, sem entrada nova no histórico):
 * ficar na URL faria o formulário reabrir sozinho ao voltar pela seta.
 */
export function useAbrirNovo(aoAbrir: () => void) {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('novo')
  useEffect(() => {
    if (!pedido) return
    aoAbrir()
    const limpo = new URLSearchParams(params)
    limpo.delete('novo')
    setParams(limpo, { replace: true })
    // `aoAbrir` costuma ser arrow nova a cada render: incluí-la aqui reabriria
    // o formulário em loop. O gatilho é o parâmetro, e só ele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido])
}
