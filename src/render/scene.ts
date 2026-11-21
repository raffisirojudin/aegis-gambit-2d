import type { PieceSymbol, Square } from 'chess.js'
import type { CombatEngine, CombatEvent } from '../game/combat'
import { ARCHETYPES, COMBAT_INTRO_SECONDS, DUEL_SECONDS, PALETTE, SPECIAL_NAMES, THEMES } from '../game/constants'
import { playSfx } from '../game/audio'
import { type GameState, type Phase, useGameStore } from '../store/gameStore'
import {
  type Camera,
  type Point,
  clamp,
  drawBoardPiece,
  drawFighter,
  easeInOutCubic,
  easeOutCubic,
  ellipse,
  lerp,
  pickSquare,
  polygon,
  project,
} from './draw'

interface PieceData {
  type: PieceSymbol
  color: 'w' | 'b'
}

interface MoveAnim {
  from: Square
  to: Square
  piece: PieceData
  start: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface DamageNumber {
  x: number
  y: number
  value: number
  life: number
  color: string
}

interface Wave {
  x: number
  y: number
  radius: number
  maxRadius: number
  life: number
  maxLife: number
  color: string
}

interface FloatingLabel {
  x: number
  y: number
  text: string
  life: number
  color: string
}

function squareName(file: number, rank: number): Square {
  return `${'abcdefgh'[file]}${rank}` as Square
}

function squareCoords(square: Square): [number, number] {
  return ['abcdefgh'.indexOf(square[0]) - 3.5, 4.5 - Number(square[1])]
}

function boardMap(chess: GameState['chess']): Map<Square, PieceData> {
  const map = new Map<Square, PieceData>()
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) map.set(cell.square, { type: cell.type, color: cell.color })
    }
  }
  return map
}

export class GameRenderer {
  camera: Camera = { yaw: 0, squash: 0.52, zoom: 1, cx: 0, cy: 0, tileW: 64, blend: 0 }
  hover: Square | null = null
  private targetYaw = 0
  private targetTopDown = false
  private zoom = 1
  private initialized = false
  private previousBoard = new Map<Square, PieceData>()
  private moveAnim: MoveAnim | null = null
  private lastVersion = -1
  private lastPhase: Phase = 'BOARD'
  private transitionStart = 0
  private particles: Particle[] = []
  private numbers: DamageNumber[] = []
  private waves: Wave[] = []
  private labels: FloatingLabel[] = []

  setRotation(rotation: number): void {
    this.targetYaw = rotation * (Math.PI / 2)
  }

  setTopDown(topDown: boolean): void {
    this.targetTopDown = topDown
  }

  zoomBy(delta: number): void {
    this.zoom = clamp(this.zoom + delta, 0.72, 1.45)
  }

  setPointer(x: number, y: number, state: GameState): void {
    const square = pickSquare(this.camera, x, y)
    this.hover = square && state.phase === 'BOARD' ? square : null
  }

  pick(x: number, y: number): Square | null {
    return pickSquare(this.camera, x, y)
  }

  sync(state: GameState, time: number): void {
    if (state.phase !== this.lastPhase) {
      if (state.phase === 'TRANSITION') this.transitionStart = time
      this.lastPhase = state.phase
    }
    if (state.version !== this.lastVersion) {
      const current = boardMap(state.chess)
      if (state.lastMove && this.previousBoard.has(state.lastMove.from)) {
        const piece = current.get(state.lastMove.to) ?? this.previousBoard.get(state.lastMove.from)
        if (piece) this.moveAnim = { from: state.lastMove.from, to: state.lastMove.to, piece, start: time }
      }
      this.previousBoard = current
      this.lastVersion = state.version
    }
  }

  handleCombatEvent(event: CombatEvent, engine: CombatEngine, width: number, height: number): void {
    const muted = useGameStore.getState().muted
    const sfx = event.type === 'ko'
      ? engine.result === null || engine.result === 'DRAW' || engine.result === (engine.humanSide === 'attacker' ? 'ATTACKER' : 'DEFENDER') ? 'win' : 'lose'
      : event.type === 'dodge' ? 'dodge'
        : event.type === 'special' ? 'special'
          : event.type === 'parry' ? 'parry' : 'hit'
    playSfx(sfx, muted)
    const fighter = engine.fighters[event.side]
    const scale = arenaScale(width, height)
    const theme = THEMES[useGameStore.getState().theme] ?? THEMES.classic
    const x = width / 2 + fighter.x * 78 * scale
    const ground = height * 0.62
    const y = ground - 42 * scale

    if (event.type === 'hit' || event.type === 'parry') {
      const count = event.type === 'parry' ? 10 : 7
      for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2
        const speed = (70 + Math.random() * 90) * scale
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          life: 0.42,
          maxLife: 0.42,
          size: (1.5 + Math.random() * 2) * scale,
          color: event.type === 'parry' ? theme.parry : theme.hit,
        })
      }
      this.numbers.push({
        x,
        y: y - 26 * scale,
        value: Math.round(event.damage),
        life: 0.8,
        color: event.type === 'parry' ? theme.parry : theme.text,
      })
    } else if (event.type === 'special') {
      const piece = fighter.piece
      const accent = ARCHETYPES[piece].accent
      const radial = piece === 'b' || piece === 'r' || piece === 'k'
      const count = piece === 'r' ? 22 : piece === 'q' ? 18 : piece === 'n' ? 16 : 12
      const baseAngle = fighter.facing === 1 ? 0 : Math.PI
      const spread = piece === 'p' ? 0.55 : piece === 'q' ? 0.9 : 1.2
      const speed = (piece === 'r' ? 150 : piece === 'n' ? 130 : 95) * scale
      for (let index = 0; index < count; index++) {
        const angle = radial ? (index / count) * Math.PI * 2 : baseAngle + (Math.random() - 0.5) * spread
        this.particles.push({
          x,
          y: y + (Math.random() - 0.5) * 26 * scale,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.55 - 24 * scale,
          life: 0.55,
          maxLife: 0.55,
          size: (2 + Math.random() * 3) * scale,
          color: accent,
        })
      }
      this.waves.push({
        x,
        y: ground - 8 * scale,
        radius: 0,
        maxRadius: (piece === 'r' ? 108 : piece === 'b' ? 76 : piece === 'k' ? 84 : 58) * scale,
        life: 0.55,
        maxLife: 0.55,
        color: accent,
      })
      this.labels.push({ x, y: y - 58 * scale, text: SPECIAL_NAMES[piece], life: 1.1, color: PALETTE.goldBright })
    } else if (event.type === 'dodge') {
      const accent = ARCHETYPES[fighter.piece].accent
      for (let index = 0; index < 10; index++) {
        const angle = (Math.random() - 0.5) * Math.PI * 2
        const speed = (60 + Math.random() * 100) * scale
        this.particles.push({
          x,
          y: y + (Math.random() - 0.5) * 20 * scale,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40 * scale,
          life: 0.45,
          maxLife: 0.45,
          size: (1.5 + Math.random() * 2) * scale,
          color: accent,
        })
      }
    } else if (event.type === 'ko') {
      const accent = ARCHETYPES[fighter.piece].accent
      for (let index = 0; index < 18; index++) {
        const angle = (index / 28) * Math.PI * 2 + Math.random() * 0.4
        const speed = (90 + Math.random() * 140) * scale
        this.particles.push({
          x,
          y: y + (Math.random() - 0.5) * 30 * scale,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 50 * scale,
          life: 0.7,
          maxLife: 0.7,
          size: (2 + Math.random() * 4) * scale,
          color: accent,
        })
      }
      this.waves.push({
        x,
        y: ground - 8 * scale,
        radius: 0,
        maxRadius: 130 * scale,
        life: 0.8,
        maxLife: 0.8,
        color: accent,
      })
    }
  }

  handleMove(): void {
    playSfx('move', useGameStore.getState().muted)
  }

  update(dt: number, time: number, state: GameState, width: number, height: number): void {
    const alpha = 1 - Math.exp(-dt * 8)
    let difference = this.targetYaw - this.camera.yaw
    while (difference > Math.PI) difference -= Math.PI * 2
    while (difference < -Math.PI) difference += Math.PI * 2
    this.camera.yaw += difference * alpha
    this.camera.blend = lerp(this.camera.blend, this.targetTopDown ? 1 : 0, alpha)
    this.camera.squash = 0.52
    this.camera.zoom = lerp(this.camera.zoom, this.zoom, alpha)

    const offset = state.showHistory && width > 760 ? Math.min(110, width * 0.08) : 0
    const targetCx = width / 2 - offset
    const targetCy = height * 0.53
    const targetTileW = clamp(Math.min(width / 13, height / 8.4), 40, 78)
    if (this.initialized) {
      this.camera.cx = lerp(this.camera.cx, targetCx, alpha)
      this.camera.cy = lerp(this.camera.cy, targetCy, alpha)
      this.camera.tileW = lerp(this.camera.tileW, targetTileW, alpha)
    } else {
      this.camera.cx = targetCx
      this.camera.cy = targetCy
      this.camera.tileW = targetTileW
      this.initialized = true
    }

    this.sync(state, time)
    if (this.moveAnim && time - this.moveAnim.start > 0.38) this.moveAnim = null

    for (const particle of this.particles) {
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += 220 * dt
      particle.life -= dt
    }
    this.particles = this.particles.filter((particle) => particle.life > 0).slice(-180)

    for (const number of this.numbers) {
      number.y -= 34 * dt
      number.life -= dt
    }
    this.numbers = this.numbers.filter((number) => number.life > 0).slice(-24)

    for (const wave of this.waves) {
      const progress = 1 - wave.life / wave.maxLife
      wave.radius = wave.maxRadius * (1 - Math.pow(1 - progress, 3))
      wave.life -= dt
    }
    this.waves = this.waves.filter((wave) => wave.life > 0).slice(-12)

    for (const label of this.labels) {
      label.y -= 22 * dt
      label.life -= dt
    }
    this.labels = this.labels.filter((label) => label.life > 0).slice(-8)
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: GameState, engine: CombatEngine | null, time: number): void {
    drawBackground(ctx, width, height)

    if (state.phase === 'TRANSITION') {
      const t = easeInOutCubic(clamp((time - this.transitionStart) / 0.8, 0, 1))
      ctx.save()
      ctx.globalAlpha = 1 - t
      this.drawBoard(ctx, width, height, state, time, true)
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = t
      this.drawArena(ctx, width, height, engine, state, time, t)
      ctx.restore()
      return
    }

    if (state.phase === 'COMBAT') {
      this.drawArena(ctx, width, height, engine, state, time, 1)
      return
    }

    this.drawBoard(ctx, width, height, state, time, false)
  }

  private drawBoard(ctx: CanvasRenderingContext2D, width: number, height: number, state: GameState, time: number, dim: boolean): void {
    const pieces = boardMap(state.chess)
    const items: Array<{
      square: Square
      point: Point
      corners: Point[]
      piece: PieceData | null
      light: boolean
      file: number
      rank: number
    }> = []

    for (let rank = 8; rank >= 1; rank--) {
      for (let file = 0; file < 8; file++) {
        const square = squareName(file, rank)
        const [x, z] = squareCoords(square)
        items.push({
          square,
          point: project(this.camera, x, z),
          corners: [
            project(this.camera, x - 0.5, z - 0.5),
            project(this.camera, x + 0.5, z - 0.5),
            project(this.camera, x + 0.5, z + 0.5),
            project(this.camera, x - 0.5, z + 0.5),
          ],
          piece: pieces.get(square) ?? null,
          light: (file + rank) % 2 === 1,
          file,
          rank,
        })
      }
    }
    items.sort((a, b) => a.point.depth - b.point.depth)

    const theme = THEMES[state.theme] ?? THEMES.classic
    const pairs = (points: Point[], yOffset = 0, center?: Point, amount = 0): Array<[number, number]> =>
      points.map((point) => [
        center ? lerp(point.x, center.x, amount) : point.x,
        (center ? lerp(point.y, center.y, amount) : point.y) + yOffset,
      ])

    const frame = [
      project(this.camera, -4, -4),
      project(this.camera, 4, -4),
      project(this.camera, 4, 4),
      project(this.camera, -4, 4),
    ]
    const frameDepth = 12 * (1 - this.camera.blend) + 3
    polygon(ctx, pairs(frame, frameDepth), theme.frame, theme.frameStroke, 1.5)
    polygon(ctx, pairs(frame, 4), theme.frame, 'rgba(212,175,55,0.28)', 1)

    for (const item of items) {
      const { x, y } = item.point
      const selected = state.selected === item.square
      const target = state.legalTargets.includes(item.square)
      const hovered = this.hover === item.square
      const last = state.lastMove?.from === item.square || state.lastMove?.to === item.square
      const base = item.light ? theme.boardLight : theme.boardDark
      const fill = selected ? theme.accent : last ? (item.light ? '#d5cdb8' : '#39414c') : base
      const depth = (this.camera.tileW * this.camera.zoom * 0.16) * (1 - this.camera.blend) + 2

      polygon(ctx, pairs([item.corners[1], item.corners[2]], 0).concat(pairs([item.corners[2], item.corners[1]], depth)), item.light ? theme.squareSideLight : theme.squareSideDark)
      polygon(ctx, pairs([item.corners[2], item.corners[3]], 0).concat(pairs([item.corners[3], item.corners[2]], depth)), item.light ? theme.squareSideLight : theme.squareSideDark)
      polygon(ctx, pairs(item.corners), fill, 'rgba(10,12,16,0.3)', 1)

      if (target) {
        const pulse = 0.55 + Math.sin(time * 5) * 0.18
        const tint = item.piece ? `rgba(196,107,90,${pulse})` : `rgba(212,175,55,${pulse})`
        polygon(ctx, pairs(item.corners, 0, item.point, item.piece ? 0.26 : 0.58), tint)
      }
      if (hovered) polygon(ctx, pairs(item.corners), 'rgba(0,0,0,0)', 'rgba(240,217,138,0.85)', 1.6)
      if (selected) polygon(ctx, pairs(item.corners, 0, item.point, 0.14), 'rgba(0,0,0,0)', PALETTE.goldBright, 2)

      if (!dim && this.camera.blend > 0.35) {
        const size = Math.max(9, this.camera.tileW * this.camera.zoom * 0.15)
        ctx.fillStyle = theme.muted
        ctx.font = `600 ${size}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (item.rank === 1) ctx.fillText('abcdefgh'[item.file], x, y + this.camera.tileW * this.camera.zoom * 0.38)
        if (item.file === 0) ctx.fillText(String(item.rank), x - this.camera.tileW * this.camera.zoom * 0.4, y)
      }

      if (item.piece && !(this.moveAnim && item.square === this.moveAnim.to)) {
        const lift = selected ? 7 : 0
        drawBoardPiece(ctx, item.piece.type, item.piece.color, x, y, this.camera.zoom * (this.camera.tileW / 64), {
          selected,
          hovered,
          lift,
          time,
        }, theme)
      }
    }

    if (this.moveAnim) {
      const t = easeOutCubic(clamp((time - this.moveAnim.start) / 0.38, 0, 1))
      const [fx, fz] = squareCoords(this.moveAnim.from)
      const [tx, tz] = squareCoords(this.moveAnim.to)
      const point = project(this.camera, lerp(fx, tx, t), lerp(fz, tz, t), Math.sin(t * Math.PI) * 0.32)
      drawBoardPiece(ctx, this.moveAnim.piece.type, this.moveAnim.piece.color, point.x, point.y, this.camera.zoom * (this.camera.tileW / 64), { time }, theme)
    }

    if (!dim) this.drawBoardHud(ctx, width, height, state)
  }

  private drawBoardHud(ctx: CanvasRenderingContext2D, width: number, height: number, state: GameState): void {
    ctx.save()
    ctx.globalAlpha = 0.75
    const theme = THEMES[state.theme] ?? THEMES.classic
    ctx.fillStyle = 'rgba(8,10,14,0.55)'
    ctx.fillRect(0, height - 42, width, 42)
    ctx.fillStyle = theme.accent
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillText(state.status, 20, height - 17)
    ctx.restore()
  }

  private drawArena(ctx: CanvasRenderingContext2D, width: number, height: number, engine: CombatEngine | null, state: GameState, time: number, appear: number): void {
    const scale = arenaScale(width, height)
    const cx = width / 2
    const ground = height * 0.62
    const shakeX = engine ? (Math.random() - 0.5) * engine.shake * 14 : 0
    const shakeY = engine ? (Math.random() - 0.5) * engine.shake * 9 : 0

    ctx.save()
    ctx.translate(shakeX, shakeY)

    const theme = THEMES[state.theme] ?? THEMES.classic
    const glow = ctx.createRadialGradient(cx, ground - 30 * scale, 10, cx, ground - 30 * scale, 330 * scale)
    glow.addColorStop(0, theme.glow)
    glow.addColorStop(1, 'rgba(11,13,17,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)

    ellipse(ctx, cx, ground + 6 * scale, 300 * scale * appear, 66 * scale * appear, theme.ground)
    const platform = ctx.createLinearGradient(cx, ground - 55 * scale, cx, ground + 55 * scale)
    platform.addColorStop(0, theme.platformLight)
    platform.addColorStop(1, theme.platformDark)
    ellipse(ctx, cx, ground, 292 * scale * appear, 62 * scale * appear, platform)
    ctx.beginPath()
    ctx.ellipse(cx, ground, 292 * scale * appear, 62 * scale * appear, 0, 0, Math.PI * 2)
    ctx.strokeStyle = theme.ring
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, ground, 245 * scale * appear, 50 * scale * appear, 0, 0, Math.PI * 2)
    ctx.strokeStyle = theme.ring
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 1

    for (const wave of this.waves) {
      ctx.globalAlpha = clamp(wave.life / wave.maxLife, 0, 1) * appear
      ctx.beginPath()
      ctx.ellipse(wave.x, wave.y, wave.radius, wave.radius * 0.34, 0, 0, Math.PI * 2)
      ctx.strokeStyle = wave.color
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    if (engine) {
      for (const projectile of engine.projectiles) {
        const px = cx + projectile.x * 78 * scale
        const py = ground - projectile.y * 46 * scale
        const orb = ctx.createRadialGradient(px, py, 1, px, py, 14 * scale)
        orb.addColorStop(0, '#ffffffcc')
        orb.addColorStop(0.4, ARCHETYPES[engine.fighters[projectile.owner]?.piece ?? 'q'].accent)
        orb.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = orb
        ctx.fillRect(px - 16 * scale, py - 16 * scale, 32 * scale, 32 * scale)
      }

      if (engine.hitStop <= 0) {
        for (const side of ['attacker', 'defender'] as const) {
          const fighter = engine.fighters[side]
          if (fighter.current?.kind === 'dash') {
            drawFighter(ctx, fighter, cx + (fighter.x - fighter.facing * 0.35) * 78 * scale, ground - 2 * scale, scale * 0.92, time, 0.25, false, theme)
          }
        }
      }

      drawFighter(ctx, engine.fighters.attacker, cx + engine.fighters.attacker.x * 78 * scale, ground - 2 * scale, scale, time, 1, engine.fighters.attacker.side !== engine.humanSide, theme)
      drawFighter(ctx, engine.fighters.defender, cx + engine.fighters.defender.x * 78 * scale, ground - 2 * scale, scale, time, 1, engine.fighters.defender.side !== engine.humanSide, theme)

      for (const particle of this.particles) {
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
        ctx.fillStyle = particle.color
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size)
      }
      ctx.globalAlpha = 1

      ctx.textAlign = 'center'
      ctx.font = `700 ${Math.round(12 * scale)}px system-ui, sans-serif`
      for (const label of this.labels) {
        ctx.globalAlpha = clamp(label.life / 1.1, 0, 1)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(8,10,14,0.9)'
        ctx.strokeText(label.text, label.x, label.y)
        ctx.fillStyle = label.color
        ctx.fillText(label.text, label.x, label.y)
      }
      ctx.globalAlpha = 1

      ctx.textAlign = 'center'
      ctx.font = `700 ${Math.round(18 * scale)}px system-ui, sans-serif`
      for (const number of this.numbers) {
        ctx.globalAlpha = clamp(number.life / 0.8, 0, 1)
        ctx.fillStyle = number.color
        ctx.fillText(`-${number.value}`, number.x, number.y)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
    }

    ctx.restore()
    this.drawCombatHud(ctx, width, height, engine, state, time, appear)
  }

  private drawCombatHud(ctx: CanvasRenderingContext2D, width: number, height: number, engine: CombatEngine | null, state: GameState, time: number, appear: number): void {
    if (!state.duel) return
    const scale = arenaScale(width, height)
    const top = clamp(height * 0.1, 74, 110)
    const barWidth = Math.min(250, width * 0.27)
    const attacker = engine?.fighters.attacker
    const defender = engine?.fighters.defender

    ctx.save()
    ctx.globalAlpha = appear

    drawHealth(ctx, width / 2 - barWidth - 34, top, barWidth, attacker?.hp ?? ARCHETYPES[state.duel.attackerPiece].hp, ARCHETYPES[state.duel.attackerPiece].hp, state.duel.attackerColor, `${ARCHETYPES[state.duel.attackerPiece].name} · ${state.duel.attackerColor === 'w' ? 'Kamu' : 'AI'}`, false)
    drawHealth(ctx, width / 2 + 34, top, barWidth, defender?.hp ?? ARCHETYPES[state.duel.defenderPiece].hp, ARCHETYPES[state.duel.defenderPiece].hp, state.duel.defenderColor, `${ARCHETYPES[state.duel.defenderPiece].name} · ${state.duel.defenderColor === 'w' ? 'Kamu' : 'AI'}`, true)

    const countdown = engine?.countdown ?? 0
    const remaining = countdown > 0 ? countdown : engine?.timeLeft ?? DUEL_SECONDS
    const urgent = countdown <= 0 && remaining <= 5
    const theme = THEMES[state.theme] ?? THEMES.classic
    ctx.textAlign = 'center'
    ctx.fillStyle = urgent ? theme.hit : theme.text
    ctx.font = `300 ${Math.round(36 * scale)}px system-ui, sans-serif`
    ctx.fillText(Math.ceil(remaining).toString().padStart(2, '0'), width / 2, top + 28)
    ctx.fillStyle = theme.muted
    ctx.font = '9px system-ui, sans-serif'
    ctx.fillText(countdown > 0 ? 'BERSIAP' : 'DETIK', width / 2, top + 44)
    ctx.beginPath()
    ctx.arc(width / 2, top + 16, 29 * scale, -Math.PI / 2, -Math.PI / 2 + (remaining / (countdown > 0 ? COMBAT_INTRO_SECONDS : DUEL_SECONDS)) * Math.PI * 2)
    ctx.strokeStyle = urgent ? theme.hit : theme.ring
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.textAlign = 'left'

    if (countdown > 0) {
      const pulse = 0.8 + Math.sin(time * 4) * 0.12
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.fillStyle = 'rgba(8,10,14,0.62)'
      ctx.fillRect(width / 2 - 118, height * 0.3 - 44, 236, 88)
      ctx.strokeStyle = 'rgba(212,175,55,0.5)'
      ctx.strokeRect(width / 2 - 118, height * 0.3 - 44, 236, 88)
      ctx.textAlign = 'center'
      ctx.fillStyle = PALETTE.goldBright
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillText('ARENA SIAP', width / 2, height * 0.3 - 20)
      ctx.fillStyle = PALETTE.ivory
      ctx.font = `300 ${Math.round(38 * scale)}px system-ui, sans-serif`
      ctx.fillText(Math.ceil(countdown).toString(), width / 2, height * 0.3 + 24)
      ctx.fillStyle = 'rgba(233,230,221,0.55)'
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillText('Bergerak setelah hitung mundur', width / 2, height * 0.3 + 41)
      ctx.restore()
      ctx.textAlign = 'left'
    }

    const human = engine?.fighters[engine.humanSide]
    const humanPiece = engine?.fighters[engine.humanSide].piece ?? (state.duel.humanSide === 'attacker' ? state.duel.attackerPiece : state.duel.defenderPiece)
    const chips: Array<[string, string, number, number]> = [
      ['J', 'Serang', 0, 1],
      ['L', 'Berat', human?.cooldowns.heavy ?? 0, ARCHETYPES[humanPiece].heavyCooldown],
      ['K', 'Tangkis', human?.cooldowns.parry ?? 0, 0.85],
      ['␣', 'Dash', human?.cooldowns.dash ?? 0, 1.5],
      ['E', SPECIAL_NAMES[humanPiece], human?.cooldowns.special ?? 0, ARCHETYPES[humanPiece].specialCooldown],
    ]
    const chipW = Math.min(84, width / 7.5)
    const startX = width / 2 - (chips.length * (chipW + 6)) / 2
    chips.forEach(([key, label, remainingCooldown, total], index) => {
      const x = startX + index * (chipW + 6)
      const y = height - 78
      const progress = total <= 0 ? 1 : 1 - clamp(remainingCooldown / total, 0, 1)
      ctx.fillStyle = 'rgba(8,10,14,0.75)'
      ctx.fillRect(x, y, chipW, 46)
      ctx.strokeStyle = progress >= 1 ? 'rgba(212,175,55,0.65)' : 'rgba(230,226,216,0.15)'
      ctx.strokeRect(x, y, chipW, 46)
      ctx.fillStyle = PALETTE.goldBright
      ctx.font = '600 14px system-ui, sans-serif'
      ctx.fillText(key, x + 8, y + 18)
      ctx.fillStyle = 'rgba(233,230,221,0.65)'
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillText(label.length > 13 ? `${label.slice(0, 12)}…` : label, x + 8, y + 38)
      ctx.fillStyle = progress >= 1 ? PALETTE.gold : 'rgba(230,226,216,0.25)'
      ctx.fillRect(x + 8, y + 25, (chipW - 16) * progress, 2)
    })

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(233,230,221,0.5)'
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillText('A/D gerak  ·  J serang  ·  K tangkis  ·  Space dash  ·  L berat  ·  E khas', width / 2, height - 16)
    ctx.textAlign = 'left'

    if (engine?.result) {
      const pulse = 0.9 + Math.sin(time * 8) * 0.1
      ctx.save()
      ctx.translate(width / 2, height * 0.42)
      ctx.scale(pulse, pulse)
      ctx.fillStyle = 'rgba(8,10,14,0.9)'
      ctx.fillRect(-150, -48, 300, 96)
      ctx.strokeStyle = 'rgba(212,175,55,0.55)'
      ctx.strokeRect(-150, -48, 300, 96)
      ctx.textAlign = 'center'
      ctx.fillStyle = PALETTE.goldBright
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText('HASIL DUEL', 0, -22)
      ctx.fillStyle = PALETTE.ivory
      ctx.font = '600 22px system-ui, sans-serif'
      ctx.fillText(resultLabel(engine.result, engine.humanSide), 0, 12)
      ctx.fillStyle = 'rgba(233,230,221,0.45)'
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText('Kembali ke papan…', 0, 34)
      ctx.restore()
      ctx.textAlign = 'left'
    }

    ctx.restore()
  }
}

function arenaScale(width: number, height: number): number {
  return clamp(Math.min(width / 900, height / 620), 0.55, 1.25)
}

function resultLabel(result: 'ATTACKER' | 'DEFENDER' | 'DRAW', humanSide: 'attacker' | 'defender'): string {
  if (result === 'DRAW') return 'IMBANG'
  const humanWon = result === (humanSide === 'attacker' ? 'ATTACKER' : 'DEFENDER')
  if (result === 'ATTACKER') return humanWon ? 'KAMU MENANG' : 'AI MENANG'
  return humanWon ? 'KAMU BERTAHAN' : 'AI BERTAHAN'
}

function drawHealth(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, hp: number, maxHp: number, color: 'w' | 'b', label: string, reversed: boolean): void {
  const ratio = clamp(hp / maxHp, 0, 1)
  ctx.fillStyle = 'rgba(8,10,14,0.7)'
  ctx.fillRect(x - 6, y - 24, width + 12, 52)
  ctx.fillStyle = PALETTE.ivory
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = reversed ? 'right' : 'left'
  ctx.fillText(label, reversed ? x + width : x, y - 10)
  ctx.fillStyle = 'rgba(233,230,221,0.5)'
  ctx.fillText(`${Math.ceil(hp)}/${maxHp}`, reversed ? x : x + width, y - 10)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(230,226,216,0.12)'
  ctx.fillRect(x, y, width, 7)
  ctx.fillStyle = ratio < 0.35 ? '#cf5f54' : color === 'w' ? PALETTE.gold : PALETTE.steel
  ctx.fillRect(reversed ? x + width * (1 - ratio) : x, y, width * ratio, 7)
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createRadialGradient(width / 2, height * 0.45, 30, width / 2, height * 0.45, Math.max(width, height))
  gradient.addColorStop(0, '#171b22')
  gradient.addColorStop(1, PALETTE.ink)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}

