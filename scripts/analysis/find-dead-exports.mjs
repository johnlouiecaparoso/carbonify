#!/usr/bin/env node
/**
 * Find exported symbols that nothing outside their own module references.
 *
 * WHY THIS IS A SCRIPT AND NOT A NUMBER IN A DOC
 * DEFERRED_BACKLOG #30 has carried a hand-counted estimate since 2026-07-26 —
 * "~100", then "~61 remaining" — and nobody could re-derive either. A count that
 * cannot be re-measured is a claim, and this repo has spent a week finding out
 * what stale claims cost. Run this instead of trusting the number.
 *
 *   node scripts/analysis/find-dead-exports.mjs
 *   node scripts/analysis/find-dead-exports.mjs --json
 *
 * WHAT IT WILL NOT TELL YOU, AND WHY THAT MATTERS
 * This is a textual reference scan, so it is deliberately CONSERVATIVE: a name
 * mentioned anywhere — a comment, a string, an unrelated local with the same
 * name — counts as used. It therefore under-reports dead code and never invents
 * it. Prefer that direction: the previous #30 pass computed line ranges,
 * corrupted two files and needed a restore from backup.
 *
 * It also cannot see the opposite trap, which bit this project once already:
 * `AdvancedSearch.vue` was dead but pinned by a `vite.config.js` manualChunks
 * entry, so an import-graph scan counted it as used. A name appearing in config
 * is not the same as a name being called.
 *
 * SO: treat the output as CANDIDATES. Verify each one, then delete with
 * exact-string edits.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const SRC = 'src'
const DEFINITION_ROOTS = ['src/services', 'src/utils', 'src/store', 'src/composables']

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const norm = (p) => relative('.', p).split('\\').join('/')

const allFiles = walk(SRC).map(norm)
const sources = new Map(
  allFiles.filter((f) => ['.js', '.vue'].includes(extname(f))).map((f) => [f, readFileSync(f, 'utf8')]),
)

// Where a symbol is defined.
const definedIn = new Map()
for (const file of allFiles) {
  if (extname(file) !== '.js') continue
  if (!DEFINITION_ROOTS.some((root) => file.startsWith(root))) continue
  if (file.includes('/test/')) continue

  const source = sources.get(file)
  const patterns = [
    /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm,
    /^export\s+const\s+([A-Za-z0-9_$]+)/gm,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(source)) !== null) {
      if (!definedIn.has(m[1])) definedIn.set(m[1], file)
    }
  }
}

const dead = []
for (const [name, file] of [...definedIn].sort()) {
  const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`)
  let used = false
  for (const [other, text] of sources) {
    if (other === file) continue
    if (re.test(text)) {
      used = true
      break
    }
  }
  if (!used) dead.push({ name, file })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(dead, null, 2))
} else {
  const byFile = new Map()
  for (const d of dead) {
    if (!byFile.has(d.file)) byFile.set(d.file, [])
    byFile.get(d.file).push(d.name)
  }
  console.log(`Scanned ${definedIn.size} exported symbols across ${DEFINITION_ROOTS.join(', ')}`)
  console.log(`${dead.length} are referenced nowhere outside their own module.\n`)
  for (const [file, names] of [...byFile].sort()) {
    console.log(`${file}  (${names.length})`)
    for (const n of names.sort()) console.log(`    ${n}`)
  }
  console.log('\nCandidates, not a verdict — read the header of this file before deleting anything.')
}
