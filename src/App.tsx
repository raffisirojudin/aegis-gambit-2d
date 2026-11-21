import { useEffect } from 'react'
import { GameCanvas } from './components/GameCanvas'
import { GameUI } from './components/GameUI'
import { AI_COLOR } from './game/constants'
import { useGameStore } from './store/gameStore'

export default function App() {
  useEffect(() => {
    let timer: number | null = null
    let scheduled = ''

    const unsubscribe = useGameStore.subscribe((state) => {
      const key = `${state.version}:${state.phase}:${state.chess.turn()}`
      const waitingForAi = state.phase === 'BOARD' && state.chess.turn() === AI_COLOR && !state.promotion

      if (!waitingForAi) {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
        scheduled = ''
        return
      }
      if (key === scheduled) return

      scheduled = key
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        useGameStore.getState().runAiTurn()
        timer = null
      }, 620)
    })

    return () => {
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  return (
    <main className="app-shell">
      <GameCanvas />
      <GameUI />
    </main>
  )
}
