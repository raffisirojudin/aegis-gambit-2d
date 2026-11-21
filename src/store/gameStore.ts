import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { create } from 'zustand'
import { chooseAiMove, applyDuelToChess } from '../game/chessEngine'
import type { CombatEngine, DuelResult, DuelSetup } from '../game/combat'
import { AI_COLOR, ARCHETYPES, PLAYER_COLOR, THEMES, isPromotionSquare } from '../game/constants'
import { createRng, type Rng } from '../game/rng'

export type Phase = 'BOARD' | 'TRANSITION' | 'COMBAT' | 'GAMEOVER'

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

function checkOutcome(chess: Chess, set: (partial: Partial<GameState>) => void): boolean {
  if (chess.isCheckmate()) {
    const loser = chess.turn()
    set({
      phase: 'GAMEOVER',
      status: `Skakmat — ${loser === PLAYER_COLOR ? 'AI' : 'Kamu'} kalah.`,
      winner: loser === PLAYER_COLOR ? AI_COLOR : PLAYER_COLOR,
    })
    return true
  }
  if (chess.isDraw() || chess.isStalemate()) {
    set({ phase: 'GAMEOVER', status: 'Permainan imbang.', winner: 'DRAW' })
    return true
  }
  return false
}

const initialState = () => ({
  chess: new Chess(),
  version: 0,
  phase: 'BOARD' as Phase,
  selected: null,
  legalTargets: [] as Square[],
  history: [] as string[],
  lastMove: null,
  status: 'Giliran kamu (Putih). Pilih bidak untuk memulai.',
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

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState(),

  selectSquare(square) {
    const state = get()
    if (state.phase !== 'BOARD' || state.promotion || state.chess.turn() !== PLAYER_COLOR) return

    const piece = state.chess.get(square)
    if (state.selected === null) {
      if (piece?.color === PLAYER_COLOR) {
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
      if (movingPiece?.type === 'p' && isPromotionSquare(square, PLAYER_COLOR)) {
        set({ promotion: { from: state.selected, to: square } })
        return
      }
      const request: MoveRequest = { from: move.from, to: move.to, promotion: move.promotion }
      if (state.chess.get(square) || move.flags.includes('e')) get().beginDuel(request, PLAYER_COLOR)
      else get().applyDirect(request)
      return
    }

    if (piece?.color === PLAYER_COLOR) {
      const targets = state.chess.moves({ verbose: true, square }).map((candidate) => candidate.to)
      set({ selected: square, legalTargets: targets })
    } else {
      set({ selected: null, legalTargets: [] })
    }
  },

  resolvePromotion(piece) {
    const promotion = get().promotion
    if (!promotion) return
    const move = get()
      .chess.moves({ verbose: true, square: promotion.from })
      .find((candidate) => candidate.to === promotion.to)
    set({ promotion: null })
    if (!move) return

    const request: MoveRequest = { from: promotion.from, to: promotion.to, promotion: piece }
    if (get().chess.get(promotion.to)) get().beginDuel(request, PLAYER_COLOR)
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
    set((current) => ({
      history: [...current.history, move.san],
      lastMove: { from: move.from, to: move.to },
      version: current.version + 1,
      selected: null,
      legalTargets: [],
      status: state.chess.isCheck() ? 'Skak! Raja dalam ancaman.' : 'Lanjut.',
    }))
    if (checkOutcome(state.chess, set)) return
    if (state.chess.turn() === AI_COLOR) set({ status: 'AI sedang menghitung langkah…' })
  },

  beginDuel(request, attackerColor) {
    const state = get()
    const attackerPiece = state.chess.get(request.from)?.type
    if (!attackerPiece) return
    const defenderPiece = state.chess.get(request.to)?.type ?? 'p'
    const duel: DuelSetup = {
      from: request.from,
      to: request.to,
      promotion: request.promotion,
      attackerColor,
      defenderColor: attackerColor === PLAYER_COLOR ? AI_COLOR : PLAYER_COLOR,
      attackerPiece,
      defenderPiece,
      humanSide: attackerColor === PLAYER_COLOR ? 'attacker' : 'defender',
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
    if (state.phase !== 'BOARD' || state.chess.turn() !== AI_COLOR) return
    const move = chooseAiMove(state.chess, AI_COLOR, matchRng)
    if (!move) {
      checkOutcome(state.chess, set)
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
    const { duel, engine, chess, history } = get()
    if (!duel || !engine?.result) return

    const outcome = applyDuelToChess(chess, duel, engine.result)
    const messages: Record<DuelResult, string> = {
      ATTACKER: `${duel.from} merebut ${duel.to} setelah duel dimenangi penyerang.`,
      DEFENDER: `${duel.from} dipukul mundur oleh bertahan.`,
      DRAW: 'Duel imbang, kedua bidak kembali.',
    }
    const status = outcome.kingSlain
      ? `Raja ${duel.defenderColor === PLAYER_COLOR ? 'kamu' : 'AI'} gugur dalam duel.`
      : messages[engine.result]

    set((state) => ({
      history: [...history, outcome.notation],
      lastMove: engine.result === 'ATTACKER' ? { from: duel.from, to: duel.to } : state.lastMove,
      version: state.version + 1,
      phase: outcome.kingSlain ? 'GAMEOVER' : 'BOARD',
      duel: null,
      engine: null,
      winner: outcome.kingSlain ? duel.attackerColor : null,
      status,
    }))

    if (!outcome.kingSlain) checkOutcome(chess, set)
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
    set({ ...initialState() })
  },
}))
