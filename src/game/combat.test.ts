import { describe, expect, it } from 'vitest'
import { CombatEngine, type ActionKind, type CombatEvent, type DuelSetup, type Side } from './combat'
import { ARCHETYPES, COMBAT_INTRO_SECONDS, DUEL_SECONDS, FIXED_STEP } from './constants'
import { createRng } from './rng'

const passiveRng = () => 0.99

function setup(): DuelSetup {
  return {
    from: 'e4',
    to: 'd5',
    attackerColor: 'w',
    defenderColor: 'b',
    attackerPiece: 'p',
    defenderPiece: 'p',
    humanSide: 'attacker',
  }
}

function makeEngine(rng: () => number = passiveRng): CombatEngine {
  const engine = new CombatEngine(setup(), rng)
  engine.countdown = 0
  engine.fighters.attacker.x = 0
  engine.fighters.defender.x = 1.1
  return engine
}

function pending(engine: CombatEngine): Record<Side, Partial<Record<ActionKind, number>>> {
  return (engine as unknown as { pending: Record<Side, Partial<Record<ActionKind, number>>> }).pending
}

function runUntil(engine: CombatEngine, predicate: (events: CombatEvent[]) => boolean, limit = 120): CombatEvent[] {
  const events: CombatEvent[] = []
  for (let step = 0; step < limit; step++) {
    engine.step(0)
    events.push(...engine.drainEvents())
    if (predicate(events)) break
  }
  return events
}

describe('CombatEngine', () => {
  it('menghasilkan simulasi identik untuk seed yang sama', () => {
    const first = makeEngine(createRng(2026))
    const second = makeEngine(createRng(2026))
    first.press('light')
    second.press('light')
    runUntil(first, () => false, 90)
    runUntil(second, () => false, 90)

    expect(first.fighters.defender.hp).toBe(second.fighters.defender.hp)
    expect(first.fighters.attacker.hp).toBe(second.fighters.attacker.hp)
    expect(first.elapsed).toBe(second.elapsed)
  })

  it('serangan ringan menurunkan HP lawan', () => {
    const engine = makeEngine()
    engine.press('light')
    const events = runUntil(engine, (current) => current.some((event) => event.type === 'hit'))

    expect(events.some((event) => event.type === 'hit')).toBe(true)
    expect(engine.fighters.defender.hp).toBeLessThan(engine.fighters.defender.maxHp)
  })

  it('parry memantulkan damage ke penyerang', () => {
    const engine = makeEngine()
    pending(engine).defender.parry = 0.2
    engine.press('light')
    const events = runUntil(engine, (current) => current.some((event) => event.type === 'parry'))

    expect(events.some((event) => event.type === 'parry')).toBe(true)
    expect(engine.fighters.defender.hp).toBe(engine.fighters.defender.maxHp)
    expect(engine.fighters.attacker.hp).toBeLessThan(engine.fighters.attacker.maxHp)
  })

  it.each(['attacker', 'defender'] as Side[])('AI menyerang lawan yang tidak bergerak (human: %s)', (humanSide) => {
    const engine = new CombatEngine({ ...setup(), humanSide }, createRng(42))
    const events: CombatEvent[] = []
    const steps = Math.ceil((DUEL_SECONDS + COMBAT_INTRO_SECONDS) / FIXED_STEP) + 2
    for (let step = 0; step < steps; step++) {
      engine.step(0)
      events.push(...engine.drainEvents())
    }
    const aiSide: Side = humanSide === 'attacker' ? 'defender' : 'attacker'
    const aiHits = events.filter((event) => event.side === humanSide && event.type === 'hit')

    expect(aiHits.length).toBeGreaterThan(0)
    expect(engine.fighters[humanSide].hp).toBeLessThan(engine.fighters[humanSide].maxHp)
    expect(engine.fighters[aiSide].hp).toBe(engine.fighters[aiSide].maxHp)
  })

  it('arena memberi hitung mundur sebelum AI boleh bergerak', () => {
    const engine = new CombatEngine(setup(), createRng(42))
    const introSteps = Math.ceil(COMBAT_INTRO_SECONDS / FIXED_STEP) - 2
    for (let step = 0; step < introSteps; step++) engine.step(1)

    expect(engine.countdown).toBeGreaterThan(0)
    expect(engine.timeLeft).toBe(DUEL_SECONDS)
    expect(engine.fighters.attacker.x).toBe(-2)
    expect(engine.fighters.defender.x).toBe(2)
    expect(engine.fighters.attacker.hp).toBe(engine.fighters.attacker.maxHp)

    for (let step = 0; step < 4; step++) engine.step(0)
    expect(engine.countdown).toBe(0)
    expect(engine.timeLeft).toBeLessThan(DUEL_SECONDS)

    for (let step = 0; step < 30; step++) engine.step(0)
    expect(engine.fighters.defender.x).toBeLessThan(2)
  })

  it('gerakan akselerasi lalu melambat saat input dilepas', () => {
    const engine = makeEngine()
    const fighter = engine.fighters.attacker
    const start = fighter.x
    engine.step(1)
    const firstStep = fighter.x - start

    expect(fighter.velocity).toBeGreaterThan(0)
    expect(firstStep).toBeGreaterThan(0)
    expect(firstStep).toBeLessThan(ARCHETYPES.p.speed * FIXED_STEP)

    for (let step = 0; step < 60; step++) engine.step(0)

    expect(fighter.velocity).toBeLessThan(0.1)
    expect(fighter.stride).toBeLessThan(0.1)
  })

  it('duel berakhir imbang saat waktu habis', () => {
    const engine = makeEngine()
    const steps = Math.ceil(DUEL_SECONDS / FIXED_STEP) + 2
    for (let step = 0; step < steps; step++) engine.step(0)

    expect(engine.timeLeft).toBe(0)
    expect(engine.result).toBe('DRAW')
  })
})
