import type { Color, PieceSymbol, Square } from 'chess.js'
import { ARCHETYPES, COMBAT_INTRO_SECONDS, DUEL_SECONDS, FIXED_STEP } from './constants'
import type { Rng } from './rng'

export type Side = 'attacker' | 'defender'
export type ActionKind = 'light' | 'heavy' | 'parry' | 'dash' | 'special'
export type DuelResult = 'ATTACKER' | 'DEFENDER' | 'DRAW'

export interface DuelSetup {
  from: Square
  to: Square
  promotion?: PieceSymbol
  attackerColor: Color
  defenderColor: Color
  attackerPiece: PieceSymbol
  defenderPiece: PieceSymbol
  humanSide: Side
}

export interface Intent {
  move: number
  light: boolean
  heavy: boolean
  parry: boolean
  dash: boolean
  special: boolean
}

export interface CombatEvent {
  type: 'hit' | 'parry' | 'dodge' | 'special' | 'ko'
  x: number
  side: Side
  damage: number
}

export interface ActionConfig {
  kind: ActionKind
  duration: number
  cooldown: number
  hits: number[]
  hitDone: boolean[]
  range: number
  damage: number
  stun: number
  projectile: boolean
  dashDistance: number
  parry: boolean
  reflect: number
  parryWindow: number
  invuln: number
}

export interface Fighter {
  side: Side
  piece: PieceSymbol
  color: Color
  x: number
  facing: number
  hp: number
  maxHp: number
  current: ActionConfig | null
  actionTime: number
  cooldowns: Record<string, number>
  invuln: number
  stun: number
  flash: number
  walkPhase: number
  moving: boolean
  velocity: number
  stride: number
}

interface Projectile {
  id: number
  x: number
  y: number
  vx: number
  damage: number
  stun: number
  owner: Side
}

const EMPTY_INTENT: Intent = { move: 0, light: false, heavy: false, parry: false, dash: false, special: false }
const ACTION_ORDER: ActionKind[] = ['special', 'heavy', 'light', 'parry', 'dash']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * rate))
}

function ready(fighter: Fighter, kind: ActionKind): boolean {
  return (fighter.cooldowns[kind] ?? 0) <= 0
}

function makeConfig(kind: ActionKind, fighter: Fighter): ActionConfig {
  const stats = ARCHETYPES[fighter.piece]
  const edge = fighter.side === 'attacker' ? 0.85 : 1
  const base: ActionConfig = {
    kind,
    duration: 0.4,
    cooldown: 0.5,
    hits: [],
    hitDone: [],
    range: stats.range,
    damage: stats.damage,
    stun: 0,
    projectile: false,
    dashDistance: 0,
    parry: false,
    reflect: 0,
    parryWindow: 0,
    invuln: 0,
  }

  if (kind === 'light') {
    return { ...base, duration: 0.22, cooldown: stats.attackCooldown * edge, hits: [0.12] }
  }
  if (kind === 'heavy') {
    return {
      ...base,
      duration: 0.34,
      cooldown: stats.heavyCooldown * edge,
      hits: [0.22],
      damage: stats.damage * 1.75,
      range: stats.range + 0.3,
      stun: 0.35,
    }
  }
  if (kind === 'parry') {
    const royal = fighter.piece === 'k'
    return {
      ...base,
      duration: royal ? 0.6 : 0.4,
      cooldown: 0.85,
      parry: true,
      reflect: royal ? 1.1 : 0.55,
      parryWindow: royal ? 0.55 : 0.28,
    }
  }
  if (kind === 'dash') {
    return { ...base, duration: 0.24, cooldown: 1.5, dashDistance: 1.8, invuln: 0.22 }
  }

  const specials: Record<PieceSymbol, Partial<ActionConfig>> = {
    p: { duration: 0.5, cooldown: stats.specialCooldown, hits: [0.16], range: 2.4, damage: stats.damage * 1.7, dashDistance: 0.9 },
    n: { duration: 0.55, cooldown: stats.specialCooldown, hits: [0.26], range: 1.9, damage: stats.damage * 1.6, dashDistance: 1.6, stun: 0.4 },
    b: { duration: 0.62, cooldown: stats.specialCooldown, hits: [0.24], range: 9, damage: stats.damage * 1.5, projectile: true },
    r: { duration: 0.9, cooldown: stats.specialCooldown, hits: [0.42], range: 2.35, damage: stats.damage * 1.9, stun: 0.7 },
    q: { duration: 0.75, cooldown: stats.specialCooldown, hits: [0.18, 0.34, 0.5], range: 2.45, damage: stats.damage * 0.85 },
    k: { duration: 0.7, cooldown: stats.specialCooldown, parry: true, reflect: 1.15, parryWindow: 0.62, damage: 0 },
  }
  const config = specials[fighter.piece]
  return { ...base, kind: 'special', ...config, hitDone: (config.hits ?? []).map(() => false) }
}

class CombatAI {
  private timer = 0
  private intent: Intent = { ...EMPTY_INTENT }

  wake(): void {
    this.timer = 0
    this.intent = { ...EMPTY_INTENT }
  }

  think(self: Fighter, opponent: Fighter, engine: CombatEngine): Intent {
    this.timer -= FIXED_STEP
    if (this.timer <= 0) {
      this.timer = 0.12 + engine.random() * 0.14
      this.intent = this.decide(self, opponent, engine)
    }
    this.intent.move = this.intent.dash ? this.intent.move : this.moveDirection(self, opponent)
    return this.intent
  }

  private moveDirection(self: Fighter, opponent: Fighter): number {
    const stats = ARCHETYPES[self.piece]
    const distance = Math.abs(opponent.x - self.x)
    const toward = Math.sign(opponent.x - self.x) || self.facing
    const desired = self.piece === 'b' ? 3.2 : stats.range * 0.85
    if (distance > desired + 0.25) return toward
    if (distance < desired * 0.6 && self.piece !== 'r') return -toward * 0.75
    return 0
  }

  private decide(self: Fighter, opponent: Fighter, engine: CombatEngine): Intent {
    const out: Intent = { ...EMPTY_INTENT }
    const stats = ARCHETYPES[self.piece]
    const distance = Math.abs(opponent.x - self.x)
    const toward = Math.sign(opponent.x - self.x) || self.facing
    const aggression = 0.55 + (1 - self.hp / self.maxHp) * 0.25

    out.move = this.moveDirection(self, opponent)

    const incoming =
      opponent.current !== null &&
      opponent.current.hits.some((hit) => hit > opponent.actionTime && hit - opponent.actionTime < 0.32) &&
      distance < 3.4

    if (incoming && ready(self, 'parry') && engine.random() < 0.34) {
      out.parry = true
      return out
    }

    const bolt = engine.projectiles.some((projectile) => projectile.owner !== self.side && Math.abs(projectile.x - self.x) < 1.7)
    if (bolt && ready(self, 'dash') && engine.random() < 0.6) {
      out.dash = true
      out.move = -toward
      return out
    }

    if (ready(self, 'special') && distance < (self.piece === 'b' ? 7 : stats.range + 1) && engine.random() < aggression) {
      out.special = true
      return out
    }
    if (ready(self, 'heavy') && distance < stats.range + 0.35 && engine.random() < 0.3) {
      out.heavy = true
      return out
    }
    if (ready(self, 'light') && distance < stats.range + 0.2 && engine.random() < 0.72) {
      out.light = true
      return out
    }
    return out
  }
}

export class CombatEngine {
  readonly fighters: Record<Side, Fighter>
  readonly setup: DuelSetup
  readonly humanSide: Side
  projectiles: Projectile[] = []
  events: CombatEvent[] = []
  timeLeft = DUEL_SECONDS
  countdown = COMBAT_INTRO_SECONDS
  result: DuelResult | null = null
  hitStop = 0
  shake = 0
  elapsed = 0

  private readonly ai: CombatAI | null
  private readonly rng: Rng
  private readonly pending: Record<Side, Partial<Record<ActionKind, number>>> = {
    attacker: {},
    defender: {},
  }
  private nextProjectileId = 0

  constructor(setup: DuelSetup, rng: Rng) {
    this.setup = setup
    this.humanSide = setup.humanSide
    this.rng = rng
    this.fighters = {
      attacker: this.createFighter('attacker', setup.attackerColor, setup.attackerPiece, -2),
      defender: this.createFighter('defender', setup.defenderColor, setup.defenderPiece, 2),
    }
    this.ai = setup.humanSide === 'attacker' ? new CombatAI() : setup.humanSide === 'defender' ? new CombatAI() : null
  }

  random(): number {
    return this.rng()
  }

  press(kind: ActionKind): void {
    if (this.countdown > 0) return
    this.pending[this.humanSide][kind] = this.elapsed + 0.14
  }

  step(moveDir: number): void {
    if (this.result !== null) return
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - FIXED_STEP)
      this.shake = Math.max(0, this.shake - FIXED_STEP * 2.5)
      if (this.countdown === 0) this.ai?.wake()
      return
    }
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - FIXED_STEP)
      this.shake = Math.max(0, this.shake - FIXED_STEP * 2.5)
      return
    }

    this.elapsed += FIXED_STEP
    this.timeLeft = Math.max(0, this.timeLeft - FIXED_STEP)
    this.shake = Math.max(0, this.shake - FIXED_STEP * 2.5)

    for (const side of ['attacker', 'defender'] as Side[]) {
      const queue = this.pending[side]
      for (const kind of Object.keys(queue) as ActionKind[]) {
        if ((queue[kind] ?? 0) < this.elapsed) delete queue[kind]
      }
    }

    const attacker = this.fighters.attacker
    const defender = this.fighters.defender
    attacker.facing = defender.x >= attacker.x ? 1 : -1
    defender.facing = -attacker.facing

    let aiMove = 0
    if (this.ai) {
      const aiSide: Side = this.humanSide === 'attacker' ? 'defender' : 'attacker'
      const opponentSide: Side = aiSide === 'attacker' ? 'defender' : 'attacker'
      const intent = this.ai.think(this.fighters[aiSide], this.fighters[opponentSide], this)
      aiMove = intent.move
      for (const kind of ACTION_ORDER) {
        if (intent[kind]) this.queue(aiSide, kind)
      }
    }

    this.tick(attacker, defender, this.humanSide === 'attacker' ? moveDir : aiMove)
    this.tick(defender, attacker, this.humanSide === 'defender' ? moveDir : aiMove)

    const minGap = 1
    if (defender.x - attacker.x < minGap) {
      const midpoint = (attacker.x + defender.x) / 2
      attacker.x = midpoint - minGap / 2
      defender.x = midpoint + minGap / 2
      if (attacker.velocity > 0) attacker.velocity = 0
      if (defender.velocity < 0) defender.velocity = 0
    }
    attacker.x = clamp(attacker.x, -3.5, defender.x - minGap)
    defender.x = clamp(defender.x, attacker.x + minGap, 3.5)

    this.updateProjectiles()

    if (this.timeLeft <= 0) this.finish('DRAW')
    else if (attacker.hp <= 0 && defender.hp <= 0) this.finish('DRAW')
    else if (attacker.hp <= 0) this.finish('DEFENDER')
    else if (defender.hp <= 0) this.finish('ATTACKER')
  }

  drainEvents(): CombatEvent[] {
    const events = this.events
    this.events = []
    return events
  }

  private createFighter(side: Side, color: Color, piece: PieceSymbol, x: number): Fighter {
    const hp = ARCHETYPES[piece].hp
    return {
      side,
      piece,
      color,
      x,
      facing: side === 'attacker' ? 1 : -1,
      hp,
      maxHp: hp,
      current: null,
      actionTime: 0,
      cooldowns: { light: 0, heavy: 0, parry: 0, dash: 0, special: 0 },
      invuln: 0,
      stun: 0,
      flash: 0,
      walkPhase: 0,
      moving: false,
      velocity: 0,
      stride: 0,
    }
  }

  private queue(side: Side, kind: ActionKind): void {
    this.pending[side][kind] = this.elapsed + 0.14
  }

  private tick(self: Fighter, opponent: Fighter, move: number): void {
    const dt = FIXED_STEP
    for (const key of Object.keys(self.cooldowns)) {
      self.cooldowns[key] = Math.max(0, self.cooldowns[key] - dt)
    }
    self.invuln = Math.max(0, self.invuln - dt)
    self.stun = Math.max(0, self.stun - dt)
    self.flash = Math.max(0, self.flash - dt)

    if (self.current) {
      const config = self.current
      self.moving = false
      self.velocity = approach(self.velocity, 0, dt, 18)
      self.stride = approach(self.stride, 0, dt, 18)
      self.actionTime += dt
      if (config.dashDistance > 0) {
        self.x += (config.dashDistance / config.duration) * dt * self.facing
      }
      for (let index = 0; index < config.hits.length; index++) {
        if (self.current !== config) return
        if (!config.hitDone[index] && self.actionTime >= config.hits[index]) {
          config.hitDone[index] = true
          this.performHit(self, opponent, config)
        }
      }
      if (self.current !== config) return
      if (self.actionTime >= config.duration) {
        self.current = null
        self.actionTime = 0
        self.velocity = 0
      }
      return
    }

    if (self.stun > 0) {
      self.moving = false
      self.velocity = approach(self.velocity, 0, dt, 12)
      self.stride = approach(self.stride, 0, dt, 12)
      return
    }

    const speed = ARCHETYPES[self.piece].speed
    const targetVelocity = move * speed
    self.velocity = approach(self.velocity, targetVelocity, dt, 14)
    self.stride = approach(self.stride, clamp(Math.abs(self.velocity) / speed, 0, 1), dt, 18)
    self.x += self.velocity * dt
    self.moving = self.stride > 0.06
    if (self.moving) self.walkPhase += dt * (8 + Math.abs(self.velocity))

    const queue = this.pending[self.side]
    for (const kind of ACTION_ORDER) {
      const expiry = queue[kind]
      if (expiry === undefined || expiry < this.elapsed || (self.cooldowns[kind] ?? 0) > 0) continue
      delete queue[kind]
      const config = makeConfig(kind, self)
      self.current = config
      self.actionTime = 0
      self.cooldowns[kind] = config.cooldown
      self.invuln = config.invuln
      if (kind === 'special') this.events.push({ type: 'special', x: self.x, side: self.side, damage: 0 })
      return
    }
  }

  private performHit(source: Fighter, target: Fighter, config: ActionConfig): void {
    if (config.parry && config.damage === 0) return
    if (config.projectile) {
      this.projectiles.push({
        id: this.nextProjectileId++,
        x: source.x + source.facing * 0.7,
        y: 1.2,
        vx: source.facing * 11,
        damage: config.damage,
        stun: config.stun,
        owner: source.side,
      })
      return
    }
    const distance = Math.abs(target.x - source.x)
    if (distance > config.range || Math.sign(target.x - source.x) !== source.facing) return
    this.resolveHit(source, target, config.damage, config.stun)
  }

  private resolveHit(source: Fighter, target: Fighter, damage: number, stun: number): void {
    if (target.invuln > 0) {
      this.events.push({ type: 'dodge', x: target.x, side: target.side, damage: 0 })
      return
    }
    if (target.current?.parry && target.actionTime <= target.current.parryWindow) {
      const reflected = damage * target.current.reflect
      source.hp -= reflected
      source.flash = 0.22
      source.current = null
      source.stun = source.piece === 'k' ? 0.25 : 0.5
      this.hitStop = Math.max(this.hitStop, 0.09)
      this.shake = Math.max(this.shake, 0.5)
      this.events.push({ type: 'parry', x: target.x, side: target.side, damage: reflected })
      return
    }

    target.hp -= damage
    target.flash = 0.2
    if (stun > 0) {
      target.stun = stun
      target.current = null
    }
    this.hitStop = Math.max(this.hitStop, stun > 0 ? 0.085 : 0.06)
    this.shake = Math.max(this.shake, stun > 0 ? 0.55 : 0.3)
    this.events.push({ type: 'hit', x: target.x, side: target.side, damage })
  }

  private updateProjectiles(): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.vx * FIXED_STEP
      const target = this.fighters[projectile.owner === 'attacker' ? 'defender' : 'attacker']
      if (Math.abs(projectile.x - target.x) < 0.55) {
        this.resolveHit(this.fighters[projectile.owner], target, projectile.damage, projectile.stun)
        return false
      }
      return Math.abs(projectile.x) < 5.2
    })
  }

  private finish(result: DuelResult): void {
    this.result = result
    const loser = result === 'ATTACKER' ? this.fighters.defender : result === 'DEFENDER' ? this.fighters.attacker : null
    if (loser) this.events.push({ type: 'ko', x: loser.x, side: loser.side, damage: 0 })
  }
}
