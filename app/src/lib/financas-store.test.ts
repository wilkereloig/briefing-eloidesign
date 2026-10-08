import { describe, it, expect } from 'vitest'
import { deslocarMes } from './financas-store'

describe('deslocarMes', () => {
  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
    expect(deslocarMes('2026-10', -11)).toBe('2025-11')
  })
})
