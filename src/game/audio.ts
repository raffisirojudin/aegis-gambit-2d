export type SfxKind = 'hit' | 'parry' | 'dodge' | 'special' | 'move' | 'win' | 'lose'

let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) context = new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

function tone(ctx: AudioContext, frequency: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  const start = ctx.currentTime + delay
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.6), start + duration)
  envelope.gain.setValueAtTime(gain, start)
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
  oscillator.connect(envelope).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.01)
}

function noise(ctx: AudioContext, duration: number, gain: number, highpass: number): void {
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const envelope = ctx.createGain()
  source.buffer = getNoise(ctx)
  filter.type = 'highpass'
  filter.frequency.value = highpass
  envelope.gain.setValueAtTime(gain, ctx.currentTime)
  envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  source.connect(filter).connect(envelope).connect(ctx.destination)
  source.start()
  source.stop(ctx.currentTime + duration + 0.01)
}

export function playSfx(kind: SfxKind, muted: boolean): void {
  if (muted) return
  const ctx = getContext()
  if (!ctx) return

  if (kind === 'hit') {
    noise(ctx, 0.12, 0.18, 900)
    tone(ctx, 180, 0.16, 'triangle', 0.22)
  } else if (kind === 'parry') {
    tone(ctx, 880, 0.14, 'sine', 0.15)
    tone(ctx, 1320, 0.18, 'sine', 0.11, 0.04)
  } else if (kind === 'dodge') {
    noise(ctx, 0.09, 0.1, 2400)
  } else if (kind === 'special') {
    tone(ctx, 320, 0.28, 'sawtooth', 0.1)
    tone(ctx, 640, 0.24, 'sine', 0.08, 0.06)
  } else if (kind === 'move') {
    tone(ctx, 420, 0.06, 'square', 0.05)
  } else if (kind === 'win') {
    tone(ctx, 523, 0.22, 'sine', 0.12)
    tone(ctx, 659, 0.26, 'sine', 0.12, 0.1)
    tone(ctx, 784, 0.35, 'sine', 0.12, 0.2)
  } else {
    tone(ctx, 300, 0.3, 'triangle', 0.12)
    tone(ctx, 220, 0.4, 'triangle', 0.1, 0.12)
  }
}
