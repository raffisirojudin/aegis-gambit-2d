import { useMemo } from 'react'
import type { PieceSymbol } from 'chess.js'
import { PLAYER_COLOR, THEMES } from '../game/constants'
import { useGameStore } from '../store/gameStore'

const PROMOTION_OPTIONS: Array<{ piece: PieceSymbol; label: string }> = [
  { piece: 'q', label: 'Menteri' },
  { piece: 'r', label: 'Benteng' },
  { piece: 'b', label: 'Gajah' },
  { piece: 'n', label: 'Kuda' },
]

const GLYPHS: Record<PieceSymbol, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }

function PromotionModal() {
  const promotion = useGameStore((state) => state.promotion)
  const resolve = useGameStore((state) => state.resolvePromotion)
  const cancel = useGameStore((state) => state.cancelPromotion)
  if (!promotion) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <span className="modal-card__eyebrow">PROMOSI</span>
        <h2>Pilih bentuk baru pionmu</h2>
        <div className="promotion-options">
          {PROMOTION_OPTIONS.map((option) => (
            <button key={option.piece} type="button" onClick={() => resolve(option.piece)}>
              <span className="piece-glyph">{GLYPHS[option.piece]}</span>
              {option.label}
            </button>
          ))}
        </div>
        <button className="text-button" type="button" onClick={cancel}>Batal</button>
      </div>
    </div>
  )
}

function GameOverModal() {
  const phase = useGameStore((state) => state.phase)
  const mode = useGameStore((state) => state.mode)
  const winner = useGameStore((state) => state.winner)
  const status = useGameStore((state) => state.status)
  const reset = useGameStore((state) => state.resetGame)
  const returnToLobby = useGameStore((state) => state.returnToLobby)
  if (phase !== 'GAMEOVER') return null

  const heading =
    winner === 'DRAW'
      ? 'Imbang'
      : mode === 'PVP'
        ? `${winner === 'w' ? 'Putih' : 'Hitam'} menang`
        : winner === PLAYER_COLOR
          ? 'Kemenangan di tanganmu'
          : 'AI menguasai papan'

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <span className="modal-card__eyebrow">PERMAINAN SELESAI</span>
        <h2>{heading}</h2>
        <p>{status}</p>
        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={reset}>Main lagi</button>
          <button className="text-button" type="button" onClick={returnToLobby}>Kembali ke Lobi</button>
        </div>
      </div>
    </div>
  )
}

function HistoryPanel() {
  const history = useGameStore((state) => state.history)
  const visible = useGameStore((state) => state.showHistory)
  const toggle = useGameStore((state) => state.toggleHistory)
  const rows = useMemo(() => {
    const output: Array<[number, string, string]> = []
    for (let index = 0; index < history.length; index += 2) {
      output.push([index / 2 + 1, history[index] ?? '', history[index + 1] ?? ''])
    }
    return output
  }, [history])

  return (
    <aside className={`history-panel ${visible ? '' : 'history-panel--hidden'}`}>
      <div className="history-panel__header">
        <span>NOTASI LANGKAH</span>
        <button type="button" onClick={toggle} aria-label="Tutup riwayat">×</button>
      </div>
      <div className="history-panel__list">
        {rows.length === 0 && <p className="history-empty">Belum ada langkah.</p>}
        {rows.map(([number, white, black]) => (
          <div className="history-row" key={number}>
            <span className="history-row__number">{number}.</span>
            <span>{white}</span>
            <span>{black}</span>
          </div>
        ))}
      </div>
      <div className="history-panel__legend">⚔ merebut petak · ↩ dipukul mundur · ⟲ imbang</div>
    </aside>
  )
}

export function GameUI() {
  const phase = useGameStore((state) => state.phase)
  const mode = useGameStore((state) => state.mode)
  const turn = useGameStore((state) => state.chess.turn())
  const topDown = useGameStore((state) => state.topDown)
  const muted = useGameStore((state) => state.muted)
  const showHistory = useGameStore((state) => state.showHistory)
  const theme = useGameStore((state) => state.theme)
  const engine = useGameStore((state) => state.engine)
  const toggleTopDown = useGameStore((state) => state.toggleTopDown)
  const rotateBoard = useGameStore((state) => state.rotateBoard)
  const toggleTheme = useGameStore((state) => state.toggleTheme)
  const toggleHistory = useGameStore((state) => state.toggleHistory)
  const toggleMute = useGameStore((state) => state.toggleMute)
  const reset = useGameStore((state) => state.resetGame)
  const returnToLobby = useGameStore((state) => state.returnToLobby)

  const pressKey = (code: string, down: boolean) => {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }))
  }

  const pressAction = (kind: 'light' | 'heavy' | 'parry' | 'dash' | 'special') => {
    if (phase !== 'COMBAT' || !engine) return
    engine.press(kind)
  }

  const pressActionForColor = (color: 'w' | 'b', kind: 'light' | 'heavy' | 'parry' | 'dash' | 'special') => {
    if (phase !== 'COMBAT' || !engine) return
    engine.press(kind, engine.sideForColor(color))
  }

  const turnText =
    mode === 'PVP'
      ? turn === 'w' ? 'Putih · Pemain 1' : 'Hitam · Pemain 2'
      : turn === PLAYER_COLOR ? 'Putih · Kamu' : 'Hitam · AI'

  return (
    <div className="ui-layer">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">♞</span>
          <div>
            <strong>AEGIS GAMBIT</strong>
            <small>2.5D TACTICAL ARENA</small>
          </div>
        </div>
        <div className="turn-pill">
          <span className={`turn-dot ${turn === PLAYER_COLOR ? 'turn-dot--white' : 'turn-dot--black'}`} />
          {turnText}
        </div>
        <div className="topbar__actions">
          <button type="button" onClick={rotateBoard} disabled={phase === 'COMBAT' || phase === 'TRANSITION'}>Putar</button>
          <button type="button" className={topDown ? 'active' : ''} onClick={toggleTopDown} disabled={phase === 'COMBAT' || phase === 'TRANSITION'}>Top-Down</button>
          <button type="button" onClick={toggleTheme} disabled={phase === 'COMBAT' || phase === 'TRANSITION'}>Tema: {THEMES[theme]?.name}</button>
          <button type="button" className={showHistory ? 'active' : ''} onClick={toggleHistory}>Riwayat</button>
          <button type="button" onClick={toggleMute}>{muted ? 'Suara mati' : 'Suara'} </button>
          <button type="button" onClick={reset}>Ulangi</button>
          <button type="button" onClick={returnToLobby}>Lobi</button>
        </div>
      </header>

      {phase === 'TRANSITION' && <div className="transition-label">MEMASUKI ARENA…</div>}
      <HistoryPanel />
      <PromotionModal />
      <GameOverModal />

      {phase === 'COMBAT' && engine?.twoPlayer ? (
        <div className="mobile-controls mobile-controls--pvp" aria-label="Kontrol duel dua pemain">
          <div className="duel-pad">
            <span className="duel-pad__label">P1 · Putih</span>
            <div className="duel-pad__row">
              <button type="button" onPointerDown={() => pressKey('KeyA', true)} onPointerUp={() => pressKey('KeyA', false)} onPointerCancel={() => pressKey('KeyA', false)} onPointerLeave={() => pressKey('KeyA', false)}>←</button>
              <button type="button" onPointerDown={() => pressKey('KeyD', true)} onPointerUp={() => pressKey('KeyD', false)} onPointerCancel={() => pressKey('KeyD', false)} onPointerLeave={() => pressKey('KeyD', false)}>→</button>
            </div>
            <div className="duel-pad__row">
              <button type="button" onPointerDown={() => pressActionForColor('w', 'light')}>J</button>
              <button type="button" onPointerDown={() => pressActionForColor('w', 'heavy')}>L</button>
              <button type="button" onPointerDown={() => pressActionForColor('w', 'parry')}>K</button>
              <button type="button" onPointerDown={() => pressActionForColor('w', 'dash')}>␣</button>
              <button type="button" onPointerDown={() => pressActionForColor('w', 'special')}>E</button>
            </div>
          </div>
          <div className="duel-pad">
            <span className="duel-pad__label">P2 · Hitam</span>
            <div className="duel-pad__row">
              <button type="button" onPointerDown={() => pressKey('ArrowLeft', true)} onPointerUp={() => pressKey('ArrowLeft', false)} onPointerCancel={() => pressKey('ArrowLeft', false)} onPointerLeave={() => pressKey('ArrowLeft', false)}>←</button>
              <button type="button" onPointerDown={() => pressKey('ArrowRight', true)} onPointerUp={() => pressKey('ArrowRight', false)} onPointerCancel={() => pressKey('ArrowRight', false)} onPointerLeave={() => pressKey('ArrowRight', false)}>→</button>
            </div>
            <div className="duel-pad__row">
              <button type="button" onPointerDown={() => pressActionForColor('b', 'light')}>1</button>
              <button type="button" onPointerDown={() => pressActionForColor('b', 'heavy')}>2</button>
              <button type="button" onPointerDown={() => pressActionForColor('b', 'parry')}>3</button>
              <button type="button" onPointerDown={() => pressActionForColor('b', 'dash')}>4</button>
              <button type="button" onPointerDown={() => pressActionForColor('b', 'special')}>5</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mobile-controls" aria-label="Kontrol sentuh">
          <div className="mobile-controls__group mobile-controls__group--move">
            <button type="button" onPointerDown={() => pressKey('KeyA', true)} onPointerUp={() => pressKey('KeyA', false)} onPointerCancel={() => pressKey('KeyA', false)} onPointerLeave={() => pressKey('KeyA', false)}>←</button>
            <button type="button" onPointerDown={() => pressKey('KeyD', true)} onPointerUp={() => pressKey('KeyD', false)} onPointerCancel={() => pressKey('KeyD', false)} onPointerLeave={() => pressKey('KeyD', false)}>→</button>
          </div>
          <div className="mobile-controls__group mobile-controls__group--actions">
            <button type="button" onPointerDown={() => pressAction('light')}>J</button>
            <button type="button" onPointerDown={() => pressAction('heavy')}>L</button>
            <button type="button" onPointerDown={() => pressAction('parry')}>K</button>
            <button type="button" onPointerDown={() => pressAction('dash')}>␣</button>
            <button type="button" onPointerDown={() => pressAction('special')}>E</button>
          </div>
        </div>
      )}
    </div>
  )
}
