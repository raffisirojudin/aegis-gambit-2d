import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { DuelSetup } from './combat'
import { applyDuelToChess, chooseAiMove, flipTurn } from './chessEngine'
import { createRng } from './rng'

const CAPTURE_FEN = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 3'

function setup(overrides: Partial<DuelSetup> = {}): DuelSetup {
  return {
    from: 'e4',
    to: 'd5',
    attackerColor: 'w',
    defenderColor: 'b',
    attackerPiece: 'p',
    defenderPiece: 'p',
    humanSide: 'attacker',
    ...overrides,
  }
}

describe('chessEngine', () => {
  it('memilih langkah AI yang legal', () => {
    const chess = new Chess()
    const move = chooseAiMove(chess, 'b', createRng(7))

    expect(move).not.toBeNull()
    expect(chess.moves({ verbose: true }).some((candidate) => candidate.san === move?.san)).toBe(true)
  })

  it('membalik giliran tanpa melempar error saat raja dalam skak', () => {
    const chess = new Chess('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')

    expect(() => flipTurn(chess)).not.toThrow()
    expect(chess.turn()).toBe('b')
  })

  it('penyerang memindahkan bidak saat menang duel', () => {
    const chess = new Chess(CAPTURE_FEN)
    const outcome = applyDuelToChess(chess, setup(), 'ATTACKER')

    expect(chess.get('e4')).toBeUndefined()
    expect(chess.get('d5')?.color).toBe('w')
    expect(chess.turn()).toBe('b')
    expect(outcome.notation).toContain('⚔')
    expect(outcome.kingSlain).toBe(false)
  })

  it('bertahan memukul mundur penyerang dan giliran berganti', () => {
    const chess = new Chess(CAPTURE_FEN)
    const outcome = applyDuelToChess(chess, setup(), 'DEFENDER')

    expect(chess.get('e4')).toBeUndefined()
    expect(chess.get('d5')?.color).toBe('b')
    expect(chess.turn()).toBe('b')
    expect(outcome.notation).toContain('↩')
  })

  it('hasil imbang mempertahankan kedua bidak', () => {
    const chess = new Chess(CAPTURE_FEN)
    const outcome = applyDuelToChess(chess, setup(), 'DRAW')

    expect(chess.get('e4')?.color).toBe('w')
    expect(chess.get('d5')?.color).toBe('b')
    expect(chess.turn()).toBe('b')
    expect(outcome.notation).toBe('⟲')
  })

  it('kalahnya raja menandai duel sebagai king slain', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')
    const outcome = applyDuelToChess(chess, setup({ from: 'd1', to: 'e8', defenderPiece: 'k' }), 'ATTACKER')

    expect(chess.get('e8')).toBeUndefined()
    expect(outcome.kingSlain).toBe(true)
  })
})
