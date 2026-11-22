import { useEffect, useRef } from 'react'
import { CombatEngine, type ActionKind } from '../game/combat'
import { FIXED_STEP } from '../game/constants'
import { createRng } from '../game/rng'
import { GameRenderer } from '../render/scene'
import { useGameStore } from '../store/gameStore'

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef(new GameRenderer())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    const renderer = rendererRef.current

    let width = 0
    let height = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const initialState = useGameStore.getState()
    const initialTime = performance.now() / 1000
    renderer.update(0, initialTime, initialState, width, height)
    renderer.draw(context, width, height, initialState, initialState.engine, initialTime)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const held = new Set<string>()
    let accumulator = 0
    let last = performance.now() / 1000
    let lastVersion = useGameStore.getState().version
    let resultTimer: number | null = null
    let frame = 0

    const unsubscribe = useGameStore.subscribe((state) => {
      renderer.setRotation(state.rotation)
      renderer.setTopDown(state.topDown)
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (!held.has(event.code)) {
        const state = useGameStore.getState()
        if (state.phase === 'COMBAT' && state.engine) {
          const engine = state.engine
          const action: Record<string, ActionKind> = {
            KeyJ: 'light',
            KeyL: 'heavy',
            KeyK: 'parry',
            Space: 'dash',
            ShiftLeft: 'dash',
            ShiftRight: 'dash',
            KeyE: 'special',
            KeyQ: 'special',
          }
          if (engine.twoPlayer) {
            const secondAction: Record<string, ActionKind> = {
              Digit1: 'light',
              Digit2: 'heavy',
              Digit3: 'parry',
              Digit4: 'dash',
              Digit5: 'special',
            }
            const firstKind = action[event.code]
            const secondKind = secondAction[event.code]
            if (firstKind) engine.press(firstKind, engine.sideForColor('w'))
            if (secondKind) engine.press(secondKind, engine.sideForColor('b'))
          } else {
            const kind = action[event.code]
            if (kind) engine.press(kind)
          }
        }
      }
      held.add(event.code)
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.code)

    const onPointerDown = (event: PointerEvent) => {
      const state = useGameStore.getState()
      if (state.phase === 'COMBAT' && state.engine) {
        if (!state.engine.twoPlayer) state.engine.press(event.button === 2 ? 'parry' : 'light')
        return
      }
      if (state.phase === 'BOARD') {
        const rect = canvas.getBoundingClientRect()
        const square = renderer.pick(event.clientX - rect.left, event.clientY - rect.top)
        if (square) state.selectSquare(square)
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      renderer.setPointer(event.clientX - rect.left, event.clientY - rect.top, useGameStore.getState())
    }
    const onWheel = (event: WheelEvent) => {
      if (useGameStore.getState().phase !== 'BOARD') return
      event.preventDefault()
      renderer.zoomBy(-event.deltaY * 0.001)
    }
    const onContextMenu = (event: MouseEvent) => event.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    const subscribeDuel = useGameStore.subscribe((state, previous) => {
      if (state.phase !== 'TRANSITION' || previous.phase === 'TRANSITION' || !state.duel) return
      const duel = state.duel
      window.setTimeout(() => {
        const current = useGameStore.getState()
        if (current.phase !== 'TRANSITION' || !current.duel || current.duel !== duel) return
        const seed = (Date.now() ^ (duel.from.charCodeAt(0) * 2654435761)) >>> 0
        useGameStore.setState({ engine: new CombatEngine(duel, createRng(seed)), phase: 'COMBAT' })
      }, 800)
    })

    const loop = (nowMs: number) => {
      const now = nowMs / 1000
      const dt = Math.min(0.05, Math.max(0, now - last))
      last = now

      const state = useGameStore.getState()
      renderer.update(dt, now, state, width, height)
      if (state.version !== lastVersion) {
        if (state.phase === 'BOARD') renderer.handleMove()
        lastVersion = state.version
      }

      if (state.phase === 'COMBAT' && state.engine) {
        const engine = state.engine
        const firstMove = Number(held.has('KeyD')) - Number(held.has('KeyA'))
        const secondMove = Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'))
        const soloMove = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'))
        const whiteSide = engine.sideForColor('w')
        const attackerMove = whiteSide === 'attacker' ? firstMove : secondMove
        const defenderMove = whiteSide === 'attacker' ? secondMove : firstMove
        accumulator += dt
        let steps = 0
        while (accumulator >= FIXED_STEP && steps < 3) {
          if (engine.twoPlayer) engine.step(attackerMove, defenderMove)
          else engine.step(soloMove)
          accumulator -= FIXED_STEP
          steps++
        }
        if (steps === 5) accumulator = 0

        for (const event of engine.drainEvents()) renderer.handleCombatEvent(event, engine, width, height)

        if (engine.result !== null && resultTimer === null) {
          resultTimer = window.setTimeout(() => {
            useGameStore.getState().finishCombat()
            resultTimer = null
          }, 1300)
        }
      } else {
        accumulator = 0
        if (resultTimer !== null) {
          window.clearTimeout(resultTimer)
          resultTimer = null
        }
      }

      renderer.draw(context, width, height, state, state.engine, now)
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribe()
      subscribeDuel()
      if (resultTimer !== null) window.clearTimeout(resultTimer)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  return <canvas ref={canvasRef} className="game-canvas" />
}
