import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  CURRENT_API_VERSION,
  SUPPORTED_API_VERSIONS,
  discoveryDocument,
  parseRegistryPath,
} from '../../../supabase/functions/public-registry/routing.ts'

/**
 * Backlog #50 — the white-label API's response shape is a contract, and it was
 * served at a bare path with no version prefix.
 *
 * Two things make this file worth having:
 *
 * 1. The router is a **pure function in its own module**, so these are real
 *    behavioural assertions rather than the source-text grepping that
 *    `webhookSignatureParity` has to fall back on. That file says as much about
 *    itself; where a Deno function can be split so its logic is importable, it
 *    should be.
 *
 * 2. The assertion that actually protects the contract is not "a /v1/ route
 *    exists" — it is that **the unversioned root serves no data**. A prefix that
 *    is merely available, next to a root that still returns projects, freezes
 *    nothing: partners integrate against the shorter URL. That is the same shape
 *    as every advisory control this repo has retired.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_TS = readFileSync(
  resolve(HERE, '../../../supabase/functions/public-registry/index.ts'),
  'utf8',
)

describe('registry API — version routing', () => {
  it('treats the gateway path prefix as Supabase\'s, not ours', () => {
    // The live pathname carries Supabase's own /functions/v1/ in front of the
    // function name. Reading that as "the API is versioned" is exactly the
    // mistake this change exists to prevent.
    const route = parseRegistryPath('/functions/v1/public-registry/v1/')
    expect(route).toEqual({ kind: 'versioned', version: 'v1', resource: '' })
  })

  it('routes the local form identically to the gateway form', () => {
    expect(parseRegistryPath('/public-registry/v1')).toEqual(
      parseRegistryPath('/functions/v1/public-registry/v1'),
    )
  })

  it('serves discovery — never data — at the unversioned root', () => {
    expect(parseRegistryPath('/functions/v1/public-registry')).toEqual({ kind: 'discovery' })
    expect(parseRegistryPath('/functions/v1/public-registry/')).toEqual({ kind: 'discovery' })
  })

  it('rejects a version it does not answer instead of falling through', () => {
    const route = parseRegistryPath('/functions/v1/public-registry/v2/')
    expect(route.kind).toBe('unknown_version')
    expect(route.received).toBe('v2')
  })

  it('rejects an unversioned resource path rather than serving the listing', () => {
    // `/public-registry/projects` must not quietly become a second contract.
    const route = parseRegistryPath('/functions/v1/public-registry/projects')
    expect(route.kind).toBe('unknown_version')
  })

  it('reports a resource under a known version so the handler can 404 it', () => {
    expect(parseRegistryPath('/functions/v1/public-registry/v1/projects')).toEqual({
      kind: 'versioned',
      version: 'v1',
      resource: 'projects',
    })
  })

  it('ignores repeated and trailing slashes', () => {
    expect(parseRegistryPath('//public-registry//v1//')).toEqual({
      kind: 'versioned',
      version: 'v1',
      resource: '',
    })
  })
})

describe('registry API — the discovery document', () => {
  const doc = discoveryDocument('https://x.supabase.co/functions/v1/public-registry')

  it('names the current version and points at the versioned base', () => {
    expect(doc.currentVersion).toBe(CURRENT_API_VERSION)
    expect(doc.supportedVersions).toEqual([...SUPPORTED_API_VERSIONS])
    expect(doc.versionedBaseUrl).toBe('https://x.supabase.co/functions/v1/public-registry/v1')
  })

  it('carries no registry data of any kind', () => {
    // If this ever fails, someone has made the root useful — which is precisely
    // how the unversioned path becomes the integrated-against path again.
    const keys = Object.keys(doc)
    for (const dataKey of ['projects', 'stats', 'project', 'certificate', 'mrv']) {
      expect(keys).not.toContain(dataKey)
    }
  })

  it('lists every documented endpoint under the version prefix', () => {
    expect(doc.endpoints.length).toBeGreaterThanOrEqual(6)
    for (const endpoint of doc.endpoints) {
      expect(endpoint.path.startsWith(doc.versionedBaseUrl)).toBe(true)
    }
  })
})

describe('registry API — the handler spends the router', () => {
  // A router nothing calls is the `wallet_topup_user_id` shape: a guard that
  // exists only as a declaration. These assert index.ts actually routes on it.
  it('routes before serving anything', () => {
    expect(INDEX_TS).toMatch(/const route = parseRegistryPath\(url\.pathname\)/)
  })

  it('answers the unversioned root with the discovery document', () => {
    expect(INDEX_TS).toMatch(/route\.kind === 'discovery'[\s\S]{0,200}discoveryDocument\(/)
  })

  it('404s an unknown version and an unknown resource', () => {
    expect(INDEX_TS).toMatch(/route\.kind === 'unknown_version'/)
    expect(INDEX_TS).toMatch(/route\.resource !== ''/)
  })

  it('stamps the version on both the body and a header', () => {
    expect(INDEX_TS).toMatch(/apiVersion: CURRENT_API_VERSION/)
    expect(INDEX_TS).toMatch(/'X-Carbonify-Api-Version': CURRENT_API_VERSION/)
  })

  it('leaves no data response on the unversioned helper', () => {
    // Every response that serves registry data must go through `versioned()`.
    // `json()` survives only for discovery and the version-rejection paths,
    // which are deliberately outside the contract.
    //
    // The anchor is the first data endpoint, not `try {` — the helpers above
    // `serve()` have their own `try {` blocks, and anchoring there swept in the
    // two intentional `json()` calls and failed this test on correct code.
    const start = INDEX_TS.indexOf('// ── MRV aggregates')
    expect(start, 'the MRV endpoint marker moved — re-anchor this test').toBeGreaterThan(0)
    expect(INDEX_TS.slice(start)).not.toMatch(/return json\(/)
  })
})
