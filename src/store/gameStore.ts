import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { create } from 'zustand'
import { chooseAiMove, applyDuelToChess } from '../game/chessEngine'
import type { CombatEngine, DuelResult, DuelSetup } from '../game/combat'
import { AI_COLOR, ARCHETYPES, PLAYER_COLOR, THEMES, isPromotionSquare } from '../game/constants'
import { createRng, type Rng } from '../game/rng'

export type Phase = 'BOARD' | 'TRANSITION' | 'COMBAT' | 'GAMEOVER'
export type GameMode = 'AI' | 'PVP'
export type Screen = 'LOBBY' | 'GAME'

export interface MoveRequest {
  from: Square
  to: Square
  promotion?: PieceSymbol
}

interface PendingPromotion {
  from: Square
  to: Square
}

export interface GameState {
  screen: Screen
  mode: GameMode
  chess: Chess
  version: number
  phase: Phase
  selected: Square | null
  legalTargets: Square[]
  history: string[]
  lastMove: { from: Square; to: Square } | null
  status: string
  duel: DuelSetup | null
  engine: CombatEngine | null
  winner: Color | 'DRAW' | null
  promotion: PendingPromotion | null
  topDown: boolean
  rotation: number
  showHistory: boolean
  muted: boolean
  theme: string

  startGame: (mode: GameMode) => void
  returnToLobby: () => void
  selectSquare: (square: Square) => void
  resolvePromotion: (piece: PieceSymbol) => void
  cancelPromotion: () => void
  applyDirect: (request: MoveRequest) => void
  beginDuel: (request: MoveRequest, attackerColor: Color) => void
  runAiTurn: () => void
  finishCombat: () => void
  toggleTopDown: () => void
  rotateBoard: () => void
  toggleHistory: () => void
  toggleMute: () => void
  toggleTheme: () => void
  resetGame: () => void
}

let matchRng: Rng = createRng(Date.now())

function checkOutcome(chess: Chess, set: (partial: Partial<GameState>) => void, mode: GameMode): boolean {
  if (chess.isCheckmate()) {
    const loser = chess.turn()
    const winner: Color = loser === 'w' ? 'b' : 'w'
    set({
      phase: 'GAMEOVER',
      status:
        mode === 'PVP'
          ? `Skakmat — ${winner === 'w' ? 'Putih' : 'Hitam'} menang.`
          : `Skakmat — ${loser === PLAYER_COLOR ? 'AI' : 'Kamu'} kalah.`,
      winner,
    })
    return true
  }
  if (chess.isDraw() || chess.isStalemate()) {
    set({ phase: 'GAMEOVER', status: 'Permainan imbang.', winner: 'DRAW' })
    return true
  }
  return false
}

function turnLabel(color: Color, mode: GameMode): string {
  if (mode === 'PVP') return color === 'w' ? 'Pemain 1 (Putih)' : 'Pemain 2 (Hitam)'
  return color === PLAYER_COLOR ? 'kamu' : 'AI'
}

const initialState = (mode: GameMode = 'AI', screen: Screen = 'LOBBY') => ({
  screen,
  mode,
  chess: new Chess(),
  version: 0,
  phase: 'BOARD' as Phase,
  selected: null,
  legalTargets: [] as Square[],
  history: [] as string[],
  lastMove: null,
  status: mode === 'PVP' ? 'Giliran Pemain 1 (Putih).' : 'Giliran kamu (Putih). Pilih bidak untuk memulai.',
  duel: null,
  engine: null,
  winner: null,
  promotion: null,
  topDown: false,
  rotation: 0,
  showHistory: true,
  muted: false,
  theme: 'classic',
})

function withPreferences(state: GameState, next: ReturnType<typeof initialState>) {
  return {
    ...next,
    topDown: state.topDown,
    rotation: state.rotation,
    showHistory: state.showHistory,
    muted: state.muted,
    theme: state.theme,
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState(),

  startGame(mode) {
    matchRng = createRng(Date.now())
    set(withPreferences(get(), initialState(mode, 'GAME')))
  },

  returnToLobby() {
    set(withPreferences(get(), initialState(get().mode, 'LOBBY')))
  },

  selectSquare(square) {
    const state = get()
    if (state.phase !== 'BOARD' || state.promotion) return
    const activeColor = state.chess.turn()
    if (state.mode === 'AI' && activeColor !== PLAYER_COLOR) return

    const piece = state.chess.get(square)
    if (state.selected === null) {
      if (piece?.color === activeColor) {
        const targets = state.chess.moves({ verbose: true, square }).map((move) => move.to)
        set({ selected: square, legalTargets: targets })
      }
      return
    }

    if (square === state.selected) {
      set({ selected: null, legalTargets: [] })
      return
    }

    const move = state.chess
      .moves({ verbose: true, square: state.selected })
      .find((candidate) => candidate.to === square)

    if (move) {
      const movingPiece = state.chess.get(state.selected)
      if (movingPiece?.type === 'p' && isPromotionSquare(square, activeColor)) {
        set({ promotion: { from: state.selected, to: square } })
        return
      }
      const request: MoveRequest = { from: move.from, to: move.to, promotion: move.promotion }
      if (state.chess.get(square) || move.flags.includes('e')) get().beginDuel(request, activeColor)
      else get().applyDirect(request)
      return
    }

    if (piece?.color === activeColor) {
      const targets = state.chess.moves({ verbose: true, square }).map((candidate) => candidate.to)
      set({ selected: square, legalTargets: targets })
    } else {
      set({ selected: null, legalTargets: [] })
    }
  },

  resolvePromotion(piece) {
    const state = get()
    const promotion = state.promotion
    if (!promotion) return
    const activeColor = state.chess.get(promotion.from)?.color
    const move = state.chess
      .moves({ verbose: true, square: promotion.from })
      .find((candidate) => candidate.to === promotion.to)
    set({ promotion: null })
    if (!move || !activeColor) return

    const request: MoveRequest = { from: promotion.from, to: promotion.to, promotion: piece }
    if (state.chess.get(promotion.to)) get().beginDuel(request, activeColor)
    else get().applyDirect(request)
  },

  cancelPromotion() {
    set({ promotion: null })
  },

  applyDirect(request) {
    const state = get()
    const legal = state.chess
      .moves({ verbose: true })
      .some(
        (candidate) =>
          candidate.from === request.from &&
          candidate.to === request.to &&
          (request.promotion === undefined || candidate.promotion === request.promotion),
      )
    if (!legal) return
    const move = state.chess.move(request)
    const check = state.chess.isCheck()
    const nextStatus =
      state.mode === 'AI'
        ? check ? 'Skak! Raja dalam ancaman.' : 'Lanjut.'
        : `Giliran ${turnLabel(state.chess.turn(), state.mode)}${check ? ' — Skak!' : ''}.`
    set((current) => ({
      history: [...current.history, move.san],
      lastMove: { from: move.from, to: move.to },
      version: current.version + 1,
      selected: null,
      legalTargets: [],
      status: nextStatus,
    }))
    if (checkOutcome(state.chess, set, state.mode)) return
    if (state.mode === 'AI' && state.chess.turn() === AI_COLOR) set({ status: 'AI sedang menghitung langkah…' })
  },

  beginDuel(request, attackerColor) {
    const state = get()
    const attackerPiece = state.chess.get(request.from)?.type
    if (!attackerPiece) return
    const defenderPiece = state.chess.get(request.to)?.type ?? 'p'
    const twoPlayer = state.mode === 'PVP'
    const duel: DuelSetup = {
      from: request.from,
      to: request.to,
      promotion: request.promotion,
      attackerColor,
      defenderColor: attackerColor === 'w' ? 'b' : 'w',
      attackerPiece,
      defenderPiece,
      humanSide: twoPlayer || attackerColor === PLAYER_COLOR ? 'attacker' : 'defender',
      twoPlayer,
    }
    set({
      phase: 'TRANSITION',
      duel,
      selected: null,
      legalTargets: [],
      promotion: null,
      status: `${ARCHETYPES[attackerPiece].name} menantang ${ARCHETYPES[defenderPiece].name} di arena.`,
    })
  },

  runAiTurn() {
    const state = get()
    if (state.mode !== 'AI' || state.phase !== 'BOARD' || state.chess.turn() !== AI_COLOR) return
    const move = chooseAiMove(state.chess, AI_COLOR, matchRng)
    if (!move) {
      checkOutcome(state.chess, set, state.mode)
      return
    }
    const request: MoveRequest = {
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? (move.flags.includes('p') ? 'q' : undefined),
    }
    if (move.captured) get().beginDuel(request, AI_COLOR)
    else get().applyDirect(request)
  },

  finishCombat() {
    const state = get()
    const { duel, engine, chess, history } = state
    if (!duel || !engine?.result) return

    const outcome = applyDuelToChess(chess, duel, engine.result)
    const messages: Record<DuelResult, string> = {
      ATTACKER: `${duel.from} merebut ${duel.to} setelah duel dimenangi penyerang.`,
      DEFENDER: `${duel.from} dipukul mundur oleh bertahan.`,
      DRAW: 'Duel imbang, kedua bidak kembali.',
    }
    const colorName = (color: Color) => (color === 'w' ? 'Putih' : 'Hitam')
    const status = outcome.kingSlain
      ? state.mode === 'PVP'
        ? `Raja ${colorName(duel.defenderColor)} gugur. ${colorName(duel.attackerColor)} menang.`
        : `Raja ${duel.defenderColor === PLAYER_COLOR ? 'kamu' : 'AI'} gugur dalam duel.`
      : messages[engine.result]

    set((current) => ({
      history: [...history, outcome.notation],
      lastMove: engine.result === 'ATTACKER' ? { from: duel.from, to: duel.to } : current.lastMove,
      version: current.version + 1,
      phase: outcome.kingSlain ? 'GAMEOVER' : 'BOARD',
      duel: null,
      engine: null,
      winner: outcome.kingSlain ? duel.attackerColor : null,
      status,
    }))

    if (!outcome.kingSlain) checkOutcome(chess, set, state.mode)
  },

  toggleTopDown() {
    set((state) => ({ topDown: !state.topDown }))
  },

  rotateBoard() {
    set((state) => ({ rotation: (state.rotation + 1) % 4 }))
  },

  toggleHistory() {
    set((state) => ({ showHistory: !state.showHistory }))
  },

  toggleMute() {
    set((state) => ({ muted: !state.muted }))
  },

  toggleTheme() {
    set((state) => {
      const keys = Object.keys(THEMES)
      const index = keys.indexOf(state.theme)
      return { theme: keys[(index + 1) % keys.length] }
    })
  },

  resetGame() {
    matchRng = createRng(Date.now())
    const state = get()
    set(withPreferences(state, initialState(state.mode, state.screen)))
  },
}))
