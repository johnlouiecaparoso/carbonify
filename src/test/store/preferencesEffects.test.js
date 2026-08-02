import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { usePreferencesStore } from '@/store/preferencesStore'

/**
 * THE DEFECT THIS PINS
 *
 * `applyAccessibilitySettings()` has always added `.high-contrast`,
 * `.large-text` and `.reduced-motion` to <html>. **Nothing styled any of
 * them** — searching the whole codebase for those three class names returned
 * zero rules outside the store itself. Every accessibility toggle on the
 * preferences page saved a value, persisted it, and changed nothing.
 *
 * Two more specific bugs sat inside that:
 *
 *  1. It checked `accessibility.reducedMotion`, which NOTHING EVER WROTE. The
 *     page's switch is "Animations", under Display, writing
 *     `display.animations`. Two different keys, so the toggle a user actually
 *     sees could never affect the class the store actually set.
 *  2. `focusIndicators`, `colorBlindSupport` and `compactMode` were saved and
 *     never applied at all.
 *
 * These tests assert BOTH halves — that the class is set, and that a stylesheet
 * answers it — because either alone is what was already broken.
 */

const css = readFileSync(resolve(process.cwd(), 'src/styles/preferences.css'), 'utf8')
const root = () => document.documentElement

// This file used to install its own in-memory localStorage, because the shared
// `src/test/setup.js` stubbed the global with `vi.fn()`s that stored nothing.
// That stub is gone (2026-08-02) — happy-dom's real Storage is used now, and
// setup.js clears it between tests — so the local workaround is deleted rather
// than left to rot into a second, subtly different Storage implementation.

describe('preferences take effect', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    root().className = ''
  })

  it('high contrast sets the class AND the stylesheet answers it', () => {
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ highContrast: true })

    expect(root().classList.contains('high-contrast')).toBe(true)
    expect(css).toContain('html.high-contrast')
  })

  it('larger text sets the class AND the stylesheet answers it', () => {
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ largeText: true })

    expect(root().classList.contains('large-text')).toBe(true)
    expect(css).toContain('html.large-text')
  })

  it('strong focus outline sets the class AND the stylesheet answers it', () => {
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ focusIndicators: true })

    expect(root().classList.contains('focus-indicators')).toBe(true)
    expect(css).toContain('html.focus-indicators')
  })

  it('colour-blind support sets the class AND the stylesheet answers it', () => {
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ colorBlindSupport: true })

    expect(root().classList.contains('color-blind-support')).toBe(true)
    expect(css).toContain('html.color-blind-support')
  })

  it('turning ANIMATIONS off is what produces reduced motion', () => {
    // The exact key mismatch: the UI writes display.animations, the store used
    // to read accessibility.reducedMotion, and the two never met.
    const store = usePreferencesStore()
    store.updateDisplaySettings({ animations: false })

    expect(root().classList.contains('reduced-motion')).toBe(true)
    expect(css).toContain('html.reduced-motion')

    store.updateDisplaySettings({ animations: true })
    expect(root().classList.contains('reduced-motion')).toBe(false)
  })

  it('compact mode sets the class AND the stylesheet answers it', () => {
    const store = usePreferencesStore()
    store.updateDisplaySettings({ compactMode: true })

    expect(root().classList.contains('compact-mode')).toBe(true)
    expect(css).toContain('html.compact-mode')
  })

  it('turning a preference back off removes its class', () => {
    // toggle(), not add() — an un-removable class would strand a user in a
    // mode they cannot leave, which for "Larger text" is worse than never
    // having offered it.
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ highContrast: true, largeText: true })
    store.updateAccessibilitySettings({ highContrast: false, largeText: false })

    expect(root().classList.contains('high-contrast')).toBe(false)
    expect(root().classList.contains('large-text')).toBe(false)
  })

  it('restores saved preferences on initialize', () => {
    const store = usePreferencesStore()
    store.updateAccessibilitySettings({ highContrast: true })

    root().className = ''
    setActivePinia(createPinia())
    usePreferencesStore().initialize()

    expect(root().classList.contains('high-contrast')).toBe(true)
  })
})

describe('settings that cannot work are not offered', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('offers only English, and no flag emoji', () => {
    // Seven languages were offered and none existed — loadLanguagePack() is a
    // console.log (#27). Filipino, the one that would matter here, was never
    // on the list.
    const store = usePreferencesStore()
    expect(store.availableLanguages).toHaveLength(1)
    expect(store.availableLanguages[0].code).toBe('en')
    expect(store.availableLanguages[0].flag).toBeUndefined()
  })

  it('keeps the platform PHP-denominated', () => {
    // The currency selector offered USD/EUR/GBP/JPY while nothing converted.
    // Selecting USD would have relabelled ₱1,000 as $1,000.
    expect(usePreferencesStore().display.currency).toBe('PHP')
  })
})
