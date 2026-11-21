import type { PieceSymbol } from 'chess.js'

export const FILES = 'abcdefgh'
export const PLAYER_COLOR = 'w'
export const AI_COLOR = 'b'
export const DUEL_SECONDS = 15
export const COMBAT_INTRO_SECONDS = 3
export const FIXED_STEP = 1 / 60

export const PALETTE = {
  lightSquare: '#e6e2d8',
  darkSquare: '#2c3036',
  ivory: '#f2eee4',
  ivoryShade: '#cfc8b6',
  gold: '#d4af37',
  goldBright: '#f0d98a',
  obsidian: '#20242b',
  obsidianShade: '#12151a',
  steel: '#4a90e2',
  steelBright: '#8fc0ff',
  ink: '#0b0d11',
  panel: '#14171d',
} as const

export interface Theme {
  name: string
  boardLight: string
  boardDark: string
  frame: string
  frameStroke: string
  label: string
  squareSideLight: string
  squareSideDark: string
  pieceLight: string
  pieceDark: string
  outline: string
  glow: string
  platformLight: string
  platformDark: string
  ring: string
  ground: string
  accent: string
  text: string
  muted: string
  hit: string
  parry: string
}

export const THEMES: Record<string, Theme> = {
  classic: {
    name: 'Klasik',
    boardLight: '#e6e2d8',
    boardDark: '#2c3036',
    frame: '#0c0e12',
    frameStroke: '#d4af37',
    label: '#ecdfbc',
    squareSideLight: '#b9b4a7',
    squareSideDark: '#1c1f24',
    pieceLight: '#f2eee4',
    pieceDark: '#12151a',
    outline: 'rgba(10,12,16,0.3)',
    glow: 'rgba(74,144,226,0.16)',
    platformLight: '#4c525c',
    platformDark: '#252930',
    ring: '#d4af37',
    ground: '#22262d',
    accent: PALETTE.gold,
    text: PALETTE.ivory,
    muted: 'rgba(233,230,221,0.45)',
    hit: '#ffb08c',
    parry: PALETTE.goldBright,
  },
  neon: {
    name: 'Neon',
    boardLight: '#1a1f2e',
    boardDark: '#0f121c',
    frame: '#0a0c12',
    frameStroke: '#00f0ff',
    label: '#a0d8ff',
    squareSideLight: '#2a3040',
    squareSideDark: '#141824',
    pieceLight: '#e3f2ff',
    pieceDark: '#080a12',
    outline: 'rgba(0,240,255,0.35)',
    glow: 'rgba(0,240,255,0.12)',
    platformLight: '#2a3a50',
    platformDark: '#161c28',
    ring: '#00f0ff',
    ground: '#0b0e18',
    accent: '#00f0ff',
    text: '#d0f4ff',
    muted: 'rgba(200,240,255,0.45)',
    hit: '#ff6b8b',
    parry: '#00f0ff',
  },
  forest: {
    name: 'Hutan',
    boardLight: '#d8e2d4',
    boardDark: '#2d4a3e',
    frame: '#0b140f',
    frameStroke: '#8bc34a',
    label: '#cde8c6',
    squareSideLight: '#a8b8a0',
    squareSideDark: '#1e2e26',
    pieceLight: '#f4f7f0',
    pieceDark: '#0a120c',
    outline: 'rgba(10,16,10,0.35)',
    glow: 'rgba(139,195,74,0.12)',
    platformLight: '#5a7a5a',
    platformDark: '#2c4436',
    ring: '#8bc34a',
    ground: '#162618',
    accent: '#8bc34a',
    text: '#e8f4e0',
    muted: 'rgba(200,230,200,0.45)',
    hit: '#ffb08c',
    parry: '#8bc34a',
  },
}

export interface ArchetypeStats {
  name: string
  weapon: string
  hp: number
  speed: number
  damage: number
  range: number
  attackCooldown: number
  heavyCooldown: number
  specialCooldown: number
  accent: string
}

export const ARCHETYPES: Record<PieceSymbol, ArchetypeStats> = {
  p: { name: 'Pion', weapon: 'Tombak & Buckler', hp: 60, speed: 4.3, damage: 9, range: 1.35, attackCooldown: 0.42, heavyCooldown: 0.9, specialCooldown: 6, accent: PALETTE.gold },
  n: { name: 'Kuda', weapon: 'Twin Sabers', hp: 100, speed: 4.8, damage: 13, range: 1.5, attackCooldown: 0.58, heavyCooldown: 1.1, specialCooldown: 7, accent: '#8fb4d6' },
  b: { name: 'Gajah', weapon: 'Aether Staff', hp: 90, speed: 3.6, damage: 12, range: 3.4, attackCooldown: 0.72, heavyCooldown: 1.3, specialCooldown: 6.5, accent: '#a88ce0' },
  r: { name: 'Benteng', weapon: 'Warhammer', hp: 150, speed: 2.4, damage: 18, range: 1.7, attackCooldown: 1, heavyCooldown: 1.7, specialCooldown: 8, accent: '#c08b5c' },
  q: { name: 'Menteri', weapon: 'Greatsword', hp: 140, speed: 4.4, damage: 16, range: 2, attackCooldown: 0.62, heavyCooldown: 1.2, specialCooldown: 7, accent: PALETTE.goldBright },
  k: { name: 'Raja', weapon: 'Broadsword & Aegis', hp: 130, speed: 3.4, damage: 15, range: 1.6, attackCooldown: 0.72, heavyCooldown: 1.3, specialCooldown: 7, accent: '#f0d98a' },
}

export const SPECIAL_NAMES: Record<PieceSymbol, string> = {
  p: 'Phalanx Thrust',
  n: 'Trample Dash',
  b: 'Arcane Bolt',
  r: 'Seismic Slam',
  q: 'Sovereign Slash',
  k: 'Royal Counter',
}

export function isPromotionSquare(square: string, color: string): boolean {
  return square[1] === (color === 'w' ? '8' : '1')
}
