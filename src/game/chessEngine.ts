import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { DuelResult, DuelSetup } from './combat'
import type { Rng } from './rng'

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

function positionalBonus(piece: PieceSymbol, square: Square, color: Color): number {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const center = file === 3 || file === 4 ? 8 : 0
  const advance = color === 'w' ? rank - 1 : 8 - rank

  if (piece === 'p') return advance * advance * 2 + center
  if (piece === 'n' || piece === 'b') return center * 2 + (4 - Math.abs(3.5 - rank)) * 2
  if (piece === 'r') return rank === (color === 'w' ? 7 : 2) ? 12 : 0
  return center
}

function evaluate(chess: Chess, aiColor: Color): number {
  let score = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      const value = PIECE_VALUE[piece.type] + positionalBonus(piece.type, piece.square, piece.color)
      score += piece.color === aiColor ? value : -value
    }
  }
  return score
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean, aiColor: Color): number {
  if (chess.isCheckmate()) return maximizing ? -100000 + depth : 100000 - depth
  if (chess.isDraw() || chess.isStalemate()) return 0
  if (depth === 0) return evaluate(chess, aiColor)

  const moves = chess.moves({ verbose: true })
  if (maximizing) {
    let best = -Infinity
    for (const move of moves) {
      chess.move(move)
      const score = minimax(chess, depth - 1, alpha, beta, false, aiColor)
      chess.undo()
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best === -Infinity ? evaluate(chess, aiColor) : best
  }

  let best = Infinity
  for (const move of moves) {
    chess.move(move)
    const score = minimax(chess, depth - 1, alpha, beta, true, aiColor)
    chess.undo()
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best === Infinity ? evaluate(chess, aiColor) : best
}

export function chooseAiMove(chess: Chess, aiColor: Color, rng: Rng): Move | null {
  const candidates = chess.moves({ verbose: true })
  if (candidates.length === 0) return null

  let bestScore = -Infinity
  let bestMoves: Move[] = []

  for (const move of candidates) {
    chess.move(move)
    const score = minimax(chess, 2, -Infinity, Infinity, false, aiColor)
    chess.undo()

    const captured = move.captured ? PIECE_VALUE[move.captured] / 100 : 0
    const attacker = PIECE_VALUE[move.piece] / 100
    const duelRisk = move.captured ? (attacker - captured) * 0.35 : 0
    const adjusted = score - duelRisk

    if (adjusted > bestScore + 0.5) {
      bestScore = adjusted
      bestMoves = [move]
    } else if (Math.abs(adjusted - bestScore) <= 0.5) {
      bestMoves.push(move)
    }
  }

  return bestMoves[Math.floor(rng() * bestMoves.length)] ?? null
}

export function flipTurn(chess: Chess): void {
  const parts = chess.fen().split(' ')
  const next: Color = parts[1] === 'w' ? 'b' : 'w'
  parts[1] = next
  parts[3] = '-'
  parts[4] = String(Number(parts[4]) + 1)
  if (next === 'w') parts[5] = String(Number(parts[5]) + 1)
  chess.load(parts.join(' '), { skipValidation: true })
}

export interface DuelOutcomeInfo {
  notation: string
  kingSlain: boolean
}

export function applyDuelToChess(chess: Chess, setup: DuelSetup, result: DuelResult): DuelOutcomeInfo {
  if (result === 'ATTACKER') {
    if (setup.defenderPiece === 'k') {
      chess.remove(setup.to)
      chess.remove(setup.from)
      return { notation: `${setup.from}×${setup.to} ⚔`, kingSlain: true }
    }
    const move = chess.move({ from: setup.from, to: setup.to, promotion: setup.promotion })
    return { notation: `${move.san} ⚔`, kingSlain: false }
  }

  if (result === 'DEFENDER') {
    chess.remove(setup.from)
    flipTurn(chess)
    return { notation: `${setup.from}↩`, kingSlain: false }
  }

  flipTurn(chess)
  return { notation: '⟲', kingSlain: false }
}
