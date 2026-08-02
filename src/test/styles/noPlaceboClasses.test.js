import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, extname } from 'node:path'

/**
 * A class added from JavaScript that no stylesheet styles is a PLACEBO: it runs,
 * it costs something, and it cannot change a pixel.
 *
 * This repo has shipped four of them.
 *
 *   · `.high-contrast`, `.large-text`, `.reduced-motion` — every accessibility
 *     toggle in preferences wrote one of these and **zero rules matched**. The
 *     user who switches on "High contrast" is precisely the one who cannot work
 *     around it being fake. Fixed 2026-07-31.
 *   · `.dark` — `applyTheme()` set it on <html> from App.vue on every load,
 *     while tokens.css states the app is "NOT dark-mode aware, deliberately".
 *     The 07-31 pass removed the CONTROL and left the machinery. Fixed 08-01.
 *   · `.loaded` — an IntersectionObserver swapped `img[data-src]` and tagged the
 *     result. No template uses `data-src`, and nothing styles `.loaded`.
 *   · `.webp` — a canvas encode ran on every page load to set a body class that
 *     nothing read.
 *
 * The pattern is always the same: a feature is removed or never finished, and
 * the DOM writes behind it keep executing. So this asserts the invariant rather
 * than the four names — the next one is caught without anyone remembering.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../..')

/** Classes the app is allowed to add without a matching CSS rule. */
const ALLOWED = new Set([
  // Toggled by tests//tooling rather than styled by us.
])

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'test') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const FILES = walk(SRC)
const SOURCES = FILES.filter((f) => ['.js', '.vue'].includes(extname(f)))
const STYLES = FILES.filter((f) => ['.css', '.vue'].includes(extname(f)))

/** Class names passed to classList.add()/toggle() with a string literal. */
function classesAddedFromJs() {
  const found = new Map()
  const re = /classList\.(?:add|toggle)\(\s*'([A-Za-z0-9_-]+)'/g
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8')
    let m
    while ((m = re.exec(source)) !== null) {
      if (!found.has(m[1])) found.set(m[1], file.replace(SRC, 'src'))
    }
  }
  return found
}

const ALL_STYLES = STYLES.map((f) => readFileSync(f, 'utf8')).join('\n')

function isStyled(cls) {
  // A selector mentioning the class: `.cls`, `.cls:hover`, `html.cls .x`, etc.
  return new RegExp(`\\.${cls}\\b(?![-\\w])`).test(ALL_STYLES)
}

describe('no placebo classes', () => {
  it('every class added from JavaScript is styled by some rule', () => {
    const placebos = []
    for (const [cls, file] of classesAddedFromJs()) {
      if (ALLOWED.has(cls)) continue
      if (!isStyled(cls)) placebos.push(`.${cls} added in ${file} but styled by no rule`)
    }

    expect(placebos).toEqual([])
  })
})
