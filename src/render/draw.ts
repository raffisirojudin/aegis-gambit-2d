import type { Color, PieceSymbol, Square } from 'chess.js'
import { ARCHETYPES, PALETTE, THEMES, type Theme } from '../game/constants'
import type { Fighter } from '../game/combat'

export interface Camera {
  yaw: number
  squash: number
  zoom: number
  cx: number
  cy: number
  tileW: number
  blend: number
}

export interface Point {
  x: number
  y: number
  depth: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3)
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function project(camera: Camera, x: number, z: number, y = 0): Point {
  const cos = Math.cos(camera.yaw)
  const sin = Math.sin(camera.yaw)
  const rx = x * cos - z * sin
  const rz = x * sin + z * cos
  const tileW = camera.tileW * camera.zoom
  const tileH = tileW * camera.squash
  const blend = clamp(camera.blend, 0, 1)
  const isoX = camera.cx + ((rx - rz) * tileW) / 2
  const isoY = camera.cy + ((rx + rz) * tileH) / 2 - y * tileW * 0.6 * camera.squash
  const topX = camera.cx + rx * tileW
  const topY = camera.cy + rz * tileW - y * tileW * 0.35
  return {
    x: lerp(isoX, topX, blend),
    y: lerp(isoY, topY, blend),
    depth: lerp(rx + rz, rz, blend),
  }
}

export function pickSquare(camera: Camera, px: number, py: number): Square | null {
  const tileW = camera.tileW * camera.zoom
  const tileH = tileW * camera.squash
  const topDown = camera.blend > 0.5
  const a = (px - camera.cx) / (topDown ? tileW : tileW / 2)
  const b = (py - camera.cy) / (topDown ? tileW : tileH / 2)
  const rx = topDown ? a : (a + b) / 2
  const rz = topDown ? b : (b - a) / 2
  const cos = Math.cos(camera.yaw)
  const sin = Math.sin(camera.yaw)
  const x = rx * cos + rz * sin
  const z = -rx * sin + rz * cos
  const file = Math.round(x + 3.5)
  const rank = Math.round(4.5 - z)
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null
  return `${'abcdefgh'[file]}${rank}` as Square
}

export function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fill: string, stroke?: string, width = 1): void {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1])
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient | CanvasPattern): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function pieceColors(color: Color, theme: Theme): { body: string; shade: string; light: string; accent: string } {
  if (color === 'w') {
    return { body: theme.pieceLight, shade: PALETTE.ivoryShade, light: '#fffdf6', accent: theme.accent }
  }
  return { body: theme.pieceDark, shade: PALETTE.obsidianShade, light: '#39414b', accent: theme.accent }
}

export function drawBoardPiece(
  ctx: CanvasRenderingContext2D,
  piece: PieceSymbol,
  color: Color,
  x: number,
  y: number,
  scale: number,
  options: { selected?: boolean; hovered?: boolean; lift?: number; time?: number } = {},
  theme: Theme = THEMES.classic,
): void {
  const colors = pieceColors(color, theme)
  const outline = color === 'w' ? 'rgba(40,34,22,0.55)' : 'rgba(180,205,235,0.45)'
  const lift = options.lift ?? 0
  const bob = Math.sin((options.time ?? 0) * 2.1 + piece.charCodeAt(0)) * 0.8

  ctx.save()
  ctx.translate(x, y - lift - bob)
  ctx.scale(scale * (options.hovered ? 1.04 : 1), scale * (options.hovered ? 1.04 : 1))

  ellipse(ctx, 0, 5 + lift * 0.4, 15, 5, color === 'w' ? 'rgba(20,18,14,0.28)' : 'rgba(0,0,0,0.35)')

  if (options.selected || options.hovered) {
    ctx.beginPath()
    ctx.ellipse(0, 3, 21, 8, 0, 0, Math.PI * 2)
    ctx.strokeStyle = options.selected ? PALETTE.goldBright : 'rgba(212,175,55,0.55)'
    ctx.lineWidth = options.selected ? 2.4 : 1.4
    ctx.stroke()
  }

  ellipse(ctx, 0, 0, 14, 5.5, colors.shade)
  ellipse(ctx, 0, -1.5, 13, 5, colors.body)
  ellipse(ctx, 0, -2.2, 10, 3.2, colors.light)
  ellipse(ctx, 0, 0.2, 13, 3, colors.accent)

  const tall = piece === 'r' || piece === 'q' || piece === 'k'
  const bodyTop = tall ? -38 : piece === 'b' || piece === 'n' ? -32 : -24

  polygon(
    ctx,
    [
      [-10, -2],
      [-7, bodyTop + 6],
      [7, bodyTop + 6],
      [10, -2],
    ],
    colors.body,
    outline,
    1.1,
  )
  polygon(
    ctx,
    [
      [-7, bodyTop + 6],
      [0, bodyTop + 2],
      [7, bodyTop + 6],
      [0, bodyTop + 10],
    ],
    colors.light,
  )

  if (piece === 'p') {
    ellipse(ctx, 0, bodyTop - 6, 8, 8, colors.body)
    ellipse(ctx, 0, bodyTop - 8, 6, 5, colors.light)
    polygon(ctx, [[-6, bodyTop + 2], [-2, bodyTop - 2], [2, bodyTop - 2], [6, bodyTop + 2]], colors.body, outline, 1.1)
    ellipse(ctx, 0, bodyTop + 1, 9, 3, colors.shade)
  } else if (piece === 'n') {
    polygon(
      ctx,
      [
        [-7, bodyTop + 8],
        [-5, bodyTop - 4],
        [0, bodyTop - 14],
        [6, bodyTop - 10],
        [7, bodyTop + 4],
      ],
      colors.body,
      outline,
      1.1,
    )
    polygon(ctx, [[0, bodyTop - 14], [3, bodyTop - 20], [6, bodyTop - 14], [0, bodyTop - 8]], colors.light)
    ellipse(ctx, 4, bodyTop - 10, 1.4, 1.4, PALETTE.ink)
  } else if (piece === 'b') {
    polygon(ctx, [[-7, bodyTop + 6], [0, bodyTop - 16], [7, bodyTop + 6]], colors.body, outline, 1.1)
    ellipse(ctx, 0, bodyTop - 17, 3, 3, colors.accent)
    polygon(ctx, [[-2, bodyTop + 2], [0, bodyTop - 14], [2, bodyTop + 2]], colors.light)
  } else if (piece === 'r') {
    polygon(ctx, [[-11, bodyTop + 4], [-11, bodyTop - 4], [-5, bodyTop - 4], [-5, bodyTop + 1], [0, bodyTop - 6], [5, bodyTop + 1], [5, bodyTop - 4], [11, bodyTop - 4], [11, bodyTop + 4]], colors.body, outline, 1.1)
    ctx.strokeStyle = colors.accent
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-11, bodyTop - 4)
    ctx.lineTo(-11, bodyTop + 4)
    ctx.moveTo(11, bodyTop - 4)
    ctx.lineTo(11, bodyTop + 4)
    ctx.stroke()
  } else if (piece === 'q') {
    for (let index = -2; index <= 2; index++) {
      const spike = index === 0 ? 10 : 6
      polygon(ctx, [[index * 4 - 1.6, bodyTop + 5], [index * 4, bodyTop - spike], [index * 4 + 1.6, bodyTop + 5]], colors.accent)
    }
    ellipse(ctx, 0, bodyTop - 11, 4, 4, colors.accent)
    ellipse(ctx, 0, bodyTop - 11, 2, 2, colors.light)
  } else {
    for (let index = -2; index <= 2; index++) {
      const spike = index === 0 ? 12 : 7
      polygon(ctx, [[index * 4 - 1.6, bodyTop + 5], [index * 4, bodyTop - spike], [index * 4 + 1.6, bodyTop + 5]], colors.accent)
    }
    ellipse(ctx, 0, bodyTop - 13, 4, 4, colors.accent)
    ctx.fillStyle = colors.light
    ctx.fillRect(-2, bodyTop - 15, 4, 6)
    ctx.fillRect(-7, bodyTop - 9, 14, 3)
  }
  ctx.restore()
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  x: number,
  groundY: number,
  scale: number,
  time: number,
  alpha = 1,
  telegraph = false,
  theme: Theme = THEMES.classic,
): void {
  const colors = pieceColors(fighter.color, theme)
  const accent = ARCHETYPES[fighter.piece].accent
  const action = fighter.current
  const progress = action ? clamp(fighter.actionTime / action.duration, 0, 1) : 0
  const idle = Math.sin(time * 2.4 + (fighter.side === 'attacker' ? 0 : 1.3)) * 1.5
  const step = !action ? Math.sin(fighter.walkPhase) * fighter.stride * 7 : 0
  let lunge = 0
  let weaponAngle = -0.4 + Math.sin(time * 1.8) * 0.05

  if (action?.kind === 'light' || action?.kind === 'heavy' || action?.kind === 'special') {
    if (progress < 0.35) weaponAngle = lerp(-0.4, -2.1, easeOutCubic(progress / 0.35))
    else weaponAngle = lerp(-2.1, 0.85, easeInOutCubic((progress - 0.35) / 0.65))
    lunge = Math.sin(progress * Math.PI) * (action.kind === 'heavy' ? 16 : 10) * fighter.facing
  } else if (action?.kind === 'dash') {
    weaponAngle = -0.9
    lunge = fighter.facing * 4
  } else if (action?.parry) {
    weaponAngle = -1.4
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x + lunge, groundY + idle)
  ctx.scale(scale * fighter.facing, scale)

  ellipse(ctx, 0, 2, 20, 6, 'rgba(0,0,0,0.3)')

  ctx.strokeStyle = colors.shade
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-5, -16)
  ctx.lineTo(-6 + step, 0)
  ctx.moveTo(5, -16)
  ctx.lineTo(6 - step, 0)
  ctx.stroke()

  polygon(ctx, [[-11, -18], [-13, -44 + idle * 0.3], [12, -44 + idle * 0.3], [10, -18]], colors.body, colors.shade, 1.2)
  polygon(ctx, [[-11, -18], [-13, -44], [0, -40], [0, -18]], colors.light)
  polygon(ctx, [[-13, -44], [0, -50], [13, -44], [0, -39]], colors.accent)

  ellipse(ctx, 0, -55, 8, 9, colors.body)
  polygon(ctx, [[-8, -56], [0, -64], [8, -56], [0, -52]], colors.accent)

  ctx.save()
  ctx.translate(11, -40)
  ctx.rotate(weaponAngle)
  drawWeapon(ctx, fighter.piece, colors.accent)
  ctx.restore()

  if (telegraph && action && progress < 0.35 && action.kind !== 'parry' && action.kind !== 'dash') {
    const intensity = easeOutCubic(progress / 0.35)
    ctx.save()
    ctx.globalAlpha = alpha * (0.3 + intensity * 0.55)
    ctx.strokeStyle = '#ff8f7a'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(18, -36, 22 + intensity * 9, -0.95, 0.85)
    ctx.stroke()
    ctx.restore()
  }

  if (action?.parry && fighter.actionTime < action.parryWindow) {
    ctx.beginPath()
    ctx.arc(16, -36, 19, -1.1, 1.1)
    ctx.strokeStyle = accent
    ctx.lineWidth = 3
    ctx.globalAlpha = alpha * 0.8
    ctx.stroke()
    ctx.globalAlpha = alpha
  }

  if (fighter.flash > 0) {
    ctx.globalAlpha = alpha * clamp(fighter.flash * 3, 0, 0.75)
    polygon(ctx, [[-13, -64], [13, -64], [13, 0], [-13, 0]], '#ff8f7a')
  }

  ctx.restore()
}

function drawWeapon(ctx: CanvasRenderingContext2D, piece: PieceSymbol, accent: string): void {
  ctx.strokeStyle = accent
  ctx.fillStyle = accent
  ctx.lineCap = 'round'

  if (piece === 'p') {
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(0, -32)
    ctx.stroke()
    polygon(ctx, [[0, -34], [4, -25], [0, -22], [-4, -25]], accent)
    ctx.beginPath()
    ctx.arc(-6, 2, 7, -1.4, 1.4)
    ctx.stroke()
  } else if (piece === 'n') {
    ctx.lineWidth = 3
    for (const offset of [-3, 3]) {
      ctx.beginPath()
      ctx.moveTo(offset, 6)
      ctx.lineTo(offset + 4, -26)
      ctx.stroke()
    }
  } else if (piece === 'b') {
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 10)
    ctx.lineTo(0, -30)
    ctx.stroke()
    ellipse(ctx, 0, -33, 5, 5, accent)
  } else if (piece === 'r') {
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(0, -24)
    ctx.stroke()
    ctx.fillRect(-9, -32, 18, 9)
  } else if (piece === 'q') {
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(0, 12)
    ctx.lineTo(0, -34)
    ctx.stroke()
    polygon(ctx, [[-5, -30], [0, -42], [5, -30]], accent)
  } else {
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(0, 10)
    ctx.lineTo(0, -30)
    ctx.stroke()
    ctx.fillRect(-8, -31, 16, 3)
  }
}
