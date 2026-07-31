import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Guards the accessibility floor of the design tokens.
 *
 * DEFERRED_BACKLOG #19: --primary-color used to be #069e2d, which measures
 * 3.54:1 against white. That passes AA for large text, so every green banner
 * *title* was fine while every 0.95rem banner *subtitle* silently failed. The
 * ramp was darkened on 2026-07-26; this test exists so the next person to reach
 * for a brighter brand green finds out from the suite rather than from an audit.
 */

const TOKENS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/tokens.css'),
  'utf8',
)

const WCAG_AA_NORMAL_TEXT = 4.5

function readToken(name) {
  const match = TOKENS.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'm'))
  if (!match) throw new Error(`token ${name} not found in tokens.css, or is not a 6-digit hex`)
  return match[1]
}

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('design token contrast', () => {
  const white = '#ffffff'

  // White text sits on all three of these: page banners, primary buttons, badges.
  it.each([
    ['--primary-color', 4.7],
    ['--primary-hover', 6.2],
    ['--primary-dark', 8.1],
  ])('%s carries white text at AA', (token, atLeast) => {
    const ratio = contrast(readToken(token), white)
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)
    // Pinned near the measured value so a *lightening* regression is caught even
    // if it happens to stay above the floor.
    expect(ratio).toBeGreaterThanOrEqual(atLeast)
  })

  // These are read as text on white surfaces.
  it.each(['--text-primary', '--text-secondary', '--text-muted', '--text-green'])(
    '%s is readable on white at AA',
    (token) => {
      expect(contrast(readToken(token), white)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)
    },
  )

  it('keeps the green ramp ordered light -> dark', () => {
    const primary = luminance(readToken('--primary-color'))
    const hover = luminance(readToken('--primary-hover'))
    const dark = luminance(readToken('--primary-dark'))

    // A hover state lighter than its resting state reads as a bug, and is
    // exactly what happens if only --primary-color is darkened.
    expect(hover).toBeLessThan(primary)
    expect(dark).toBeLessThan(hover)
  })

  it('keeps the ramp steps visually distinguishable', () => {
    // Adjacent steps that differ by a hair make hover feel broken rather than subtle.
    expect(contrast(readToken('--primary-color'), readToken('--primary-hover'))).toBeGreaterThan(
      1.15,
    )
    expect(contrast(readToken('--primary-hover'), readToken('--primary-dark'))).toBeGreaterThan(1.15)
  })

  it('keeps the aliased greens in step with the ramp', () => {
    // These are the same colour by intent; letting them drift is what produced
    // the four-different-greens state the 2026-07-26 pass cleaned up.
    expect(readToken('--bg-green')).toBe(readToken('--primary-color'))
    expect(readToken('--border-green')).toBe(readToken('--primary-color'))
    expect(readToken('--bg-green-dark')).toBe(readToken('--primary-dark'))
  })
})
