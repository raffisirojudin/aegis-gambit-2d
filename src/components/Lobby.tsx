import { useGameStore } from '../store/gameStore'

const MODES = [
  {
    id: 'AI' as const,
    glyph: '♞',
    title: 'Duel vs AI',
    description: 'Kendalikan Putih melawan komandan Hitam. Setiap rebutan bidak berubah menjadi duel jarak dekat.',
    cta: 'Mulai duel',
  },
  {
    id: 'PVP' as const,
    glyph: '♜',
    title: 'Player vs Player',
    description: 'Dua pemain, satu perangkat. Putih dan Hitam bergiliran di papan, lalu bertarung langsung saat bidak bertemu.',
    cta: 'Main berdua',
  },
]

export function Lobby() {
  const startGame = useGameStore((state) => state.startGame)

  return (
    <main className="lobby-screen">
      <div className="lobby-grid" aria-hidden="true" />
      <section className="lobby-card">
        <div className="lobby-brand">
          <span className="lobby-brand__mark">♞</span>
          <div>
            <strong>AEGIS GAMBIT</strong>
            <small>2.5D TACTICAL ARENA</small>
          </div>
        </div>

        <span className="lobby-eyebrow">PILIH MODE PERTEMPURAN</span>
        <h1>Catur taktis, duel tanpa ampun.</h1>
        <p className="lobby-lead">
          Susun langkah di papan, lalu masuk ke arena saat bidak berhadapan. Pilih lawan komputer atau tantang pemain kedua di perangkat yang sama.
        </p>

        <div className="lobby-modes">
          {MODES.map((mode) => (
            <button key={mode.id} type="button" className="lobby-mode" onClick={() => startGame(mode.id)}>
              <span className="lobby-mode__glyph">{mode.glyph}</span>
              <span className="lobby-mode__body">
                <span className="lobby-mode__title">{mode.title}</span>
                <span className="lobby-mode__description">{mode.description}</span>
              </span>
              <span className="lobby-mode__cta">{mode.cta} →</span>
            </button>
          ))}
        </div>

        <div className="lobby-hints">
          <div>
            <strong>Papan</strong>
            <span>Klik atau ketuk bidak, lalu petak tujuan.</span>
          </div>
          <div>
            <strong>Duel vs AI</strong>
            <span>A/D gerak · J serang · K tangkis · L berat · Space dash · E khas</span>
          </div>
          <div>
            <strong>Duel PvP</strong>
            <span>P1: A/D + J/K/L/Space/E · P2: ←/→ + 1/2/3/4/5</span>
          </div>
        </div>
      </section>
    </main>
  )
}
