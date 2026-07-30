import { useParams } from 'react-router-dom'

export default function ClienteFicha() {
  const { id } = useParams()
  return <div className="tela"><h1>Ficha do cliente</h1><p>id={id} — chega no próximo plano (Fase B).</p></div>
}
