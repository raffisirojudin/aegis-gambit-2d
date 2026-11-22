export type SfxKind = 'hit' | 'parry' | 'dodge' | 'special' | 'move' | 'win' | 'lose'

let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let master: GainNode | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!context) {
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()

    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 20
    compressor.ratio.value = 6
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    master = context.createGain()
    master.gain.value = 0.75
    master.connect(compressor)
    compressor.connect(context.destination)
  }

  if (context.state === 'suspended') void context.resume()
  return context
}

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

interface ToneOptions {
  frequency: number
  endFrequency?: number
  duration: number
  type?: OscillatorType
  gain: number
  attack?: number
  delay?: number
  filterFrequency?: number
  filterType?: BiquadFilterType
}

function tone(ctx: AudioContext, options: ToneOptions): void {
  const { frequency, endFrequency, duration, type = 'sine', gain, attack = 0.006, delay = 0 } = options
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
  }

  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.linearRampToValueAtTime(gain, start + Math.min(attack, duration * 0.5))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  let output: AudioNode = oscillator
  if (options.filterFrequency !== undefined) {
    const filter = ctx.createBiquadFilter()
    filter.type = options.filterType ?? 'lowpass'
    filter.frequency.value = options.filterFrequency
    output.connect(filter)
    output = filter
  }

  output.connect(envelope)
  envelope.connect(master ?? ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

interface NoiseOptions {
  duration: number
  gain: number
  filterType?: BiquadFilterType
  frequency: number
  endFrequency?: number
  q?: number
  attack?: number
  delay?: number
}

function noise(ctx: AudioContext, options: NoiseOptions): void {
  const { duration, gain, filterType = 'bandpass', frequency, endFrequency, q = 1, attack = 0.003, delay = 0 } = options
  const start = ctx.currentTime + delay
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const envelope = ctx.createGain()

  source.buffer = getNoise(ctx)
  filter.type = filterType
  filter.frequency.setValueAtTime(frequency, start)
  filter.Q.value = q
  if (endFrequency !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), start + duration)
  }

  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.linearRampToValueAtTime(gain, start + Math.min(attack, duration * 0.5))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(master ?? ctx.destination)
  source.start(start)
  source.stop(start + duration + 0.02)
}

export function playSfx(kind: SfxKind, muted: boolean): void {
  if (muted) return
  const ctx = getContext()
  if (!ctx) return

  if (kind === 'move') {
    noise(ctx, { duration: 0.045, gain: 0.2, filterType: 'bandpass', frequency: 950, q: 2.4 })
    tone(ctx, { frequency: 190, endFrequency: 118, duration: 0.06, type: 'sine', gain: 0.13 })
    noise(ctx, { duration: 0.02, gain: 0.05, filterType: 'highpass', frequency: 2600, delay: 0.004 })
  } else if (kind === 'hit') {
    noise(ctx, { duration: 0.14, gain: 0.22, filterType: 'lowpass', frequency: 520 })
    tone(ctx, { frequency: 140, endFrequency: 54, duration: 0.22, type: 'sine', gain: 0.28 })
    noise(ctx, { duration: 0.03, gain: 0.06, filterType: 'bandpass', frequency: 2200, q: 1.4 })
  } else if (kind === 'parry') {
    tone(ctx, { frequency: 1240, endFrequency: 1180, duration: 0.28, type: 'sine', gain: 0.11 })
    tone(ctx, { frequency: 1860, endFrequency: 1770, duration: 0.22, type: 'sine', gain: 0.08, delay: 0.002 })
    tone(ctx, { frequency: 2790, endFrequency: 2640, duration: 0.15, type: 'sine', gain: 0.05, delay: 0.004 })
    noise(ctx, { duration: 0.1, gain: 0.09, filterType: 'bandpass', frequency: 4200, q: 7 })
  } else if (kind === 'dodge') {
    noise(ctx, { duration: 0.22, gain: 0.14, filterType: 'bandpass', frequency: 380, endFrequency: 2200, q: 0.9, attack: 0.02 })
    tone(ctx, { frequency: 320, endFrequency: 520, duration: 0.18, type: 'sine', gain: 0.04, attack: 0.02 })
  } else if (kind === 'special') {
    tone(ctx, { frequency: 98, endFrequency: 82, duration: 0.5, type: 'triangle', gain: 0.14, attack: 0.08 })
    tone(ctx, { frequency: 196, endFrequency: 147, duration: 0.45, type: 'sine', gain: 0.08, attack: 0.1, delay: 0.04 })
    noise(ctx, { duration: 0.5, gain: 0.07, filterType: 'bandpass', frequency: 300, endFrequency: 1800, q: 0.8, attack: 0.12 })
    tone(ctx, { frequency: 784, endFrequency: 880, duration: 0.3, type: 'sine', gain: 0.035, attack: 0.12, delay: 0.2 })
  } else if (kind === 'win') {
    tone(ctx, { frequency: 196, duration: 0.5, type: 'sine', gain: 0.06, attack: 0.04 })
    tone(ctx, { frequency: 392, duration: 0.5, type: 'triangle', gain: 0.08, attack: 0.03 })
    tone(ctx, { frequency: 523, duration: 0.6, type: 'triangle', gain: 0.07, attack: 0.04, delay: 0.08 })
    tone(ctx, { frequency: 659, duration: 0.8, type: 'sine', gain: 0.06, attack: 0.05, delay: 0.16 })
  } else {
    tone(ctx, { frequency: 233, endFrequency: 175, duration: 0.5, type: 'triangle', gain: 0.1, attack: 0.02 })
    tone(ctx, { frequency: 175, endFrequency: 110, duration: 0.7, type: 'sine', gain: 0.08, attack: 0.03, delay: 0.12 })
    noise(ctx, { duration: 0.3, gain: 0.045, filterType: 'lowpass', frequency: 300, attack: 0.04 })
  }
}
