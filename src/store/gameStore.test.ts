import { Chess } from 'chess.js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CombatEngine, DuelSetup } from '../game/combat'
import { useGameStore } from './gameStore'

function forceResult(result: CombatEngine['result']): void {
  useGameStore.setState({ engine: { result } as unknown as CombatEngine })
}

function captureSetup(): DuelSetup {
  return {
    from: 'e4',
    to: 'd5',
    attackerColor: 'w',
    defenderColor: 'b',
    attackerPiece: 'p',
    defenderPiece: 'p',
    humanSide: 'attacker',
  }
}

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame()
  })

  it('langkah biasa langsung diterapkan tanpa duel', () => {
    const store = useGameStore.getState()
    store.selectSquare('e2')
    store.selectSquare('e4')
    const state = useGameStore.getState()

    expect(state.phase).toBe('BOARD')
    expect(state.history).toEqual(['e4'])
    expect(state.lastMove).toEqual({ from: 'e2', to: 'e4' })
    expect(state.duel).toBeNull()
  })

  it('rebutan bidak memicu duel alih-alih langkah langsung', () => {
    let store = useGameStore.getState()
    store.applyDirect({ from: 'e2', to: 'e4' })
    store = useGameStore.getState()
    store.applyDirect({ from: 'd7', to: 'd5' })
    store = useGameStore.getState()
    store.selectSquare('e4')
    store = useGameStore.getState()
    expect(store.legalTargets).toContain('d5')

    store.selectSquare('d5')
    store = useGameStore.getState()

    expect(store.phase).toBe('TRANSITION')
    expect(store.duel).toMatchObject({
      from: 'e4',
      to: 'd5',
      attackerColor: 'w',
      defenderColor: 'b',
      attackerPiece: 'p',
      defenderPiece: 'p',
      humanSide: 'attacker',
    })
    expect(store.history).toEqual(['e4', 'd5'])
  })

  it('hasil duel penyerang diterapkan ke papan catur', () => {
    let store = useGameStore.getState()
    store.applyDirect({ from: 'e2', to: 'e4' })
    store = useGameStore.getState()
    store.applyDirect({ from: 'd7', to: 'd5' })
    store = useGameStore.getState()
    store.selectSquare('e4')
    store = useGameStore.getState()
    store.selectSquare('d5')

    forceResult('ATTACKER')
    useGameStore.getState().finishCombat()
    store = useGameStore.getState()

    expect(store.phase).toBe('BOARD')
    expect(store.chess.get('e4')).toBeUndefined()
    expect(store.chess.get('d5')?.color).toBe('w')
    expect(store.chess.turn()).toBe('b')
    expect(store.history.at(-1)).toContain('⚔')
    expect(store.engine).toBeNull()
  })

  it('raja yang gugur dalam duel mengakhiri permainan', () => {
    useGameStore.setState({
      chess: new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'),
      phase: 'COMBAT',
      duel: { ...captureSetup(), from: 'd1', to: 'e8', defenderPiece: 'k' },
    })
    forceResult('ATTACKER')
    useGameStore.getState().finishCombat()
    const state = useGameStore.getState()

    expect(state.phase).toBe('GAMEOVER')
    expect(state.winner).toBe('w')
  })
})
