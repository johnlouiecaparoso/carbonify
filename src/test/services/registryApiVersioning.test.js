import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Backlog #50 — the white-label API's response shape is a contract, and it was
 * served at a bare path with no version prefix.
 *
 * ## Why this file evaluates source text instead of importing a module
 *
 * The routing started life in `public-registry/routing.ts`, which this file
 * imported directly. That is the better shape and it **did not deploy**:
 *
 *   Failed to bundle the function (reason: Module not found
 *   "file:///tmp/user_fn_.../source/routing.ts")
 *
 * The bundler had only `index.ts`. So the routing is now inlined, and rather
 * than keep a second copy here to test against — the drift
 * `webhookSignatureParity` documents as a compromise — this file slices the
 * block out of `index.ts` and **executes the real deployed source**. One copy,
 * run by both the edge function and the suite.
 *
 * That is also why the block must stay free of TypeScript annotations: it is
 * evaluated as JavaScript. `rejects TypeScript annotations` below fails loudly
 * if someone adds one, rather than letting the whole file throw at import.
 *
 * ## What actually protects the contract
 *
 * Not "a /v1/ route exists" — it is that **the unversioned root serves no
 * data**. A prefix that is merely available, beside a root that still returns
 * projects, freezes nothing: partners integrate against the shorter URL.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = resolve(HERE, '../../../supabase/functions/public-registry/index.ts')
const INDEX_TS = readFileSync(INDEX_PATH, 'utf8')

const START = '// ─── ROUTING BLOCK START ───'
const END = '// ─── ROUTING BLOCK END ───'

function extractRoutingBlock() {
  const from = INDEX_TS.indexOf(START)
  const to = INDEX_TS.indexOf(END)
  if (from === -1 || to === -1 || to <= from) {
    throw new Error(
      'The routing block markers are missing from index.ts. If the routing moved back into ' +
        'its own module, check that it deploys before deleting this test.',
    )
  }
  return INDEX_TS.slice(from + START.length, to)
}

const block = extractRoutingBlock()

const routing = new Function(
  `${block}
  return { CURRENT_API_VERSION, SUPPORTED_API_VERSIONS, parseRegistryPath, discoveryDocument }`,
)()

const { CURRENT_API_VERSION, SUPPORTED_API_VERSIONS, parseRegistryPath, discoveryDocument } = routing

describe('registry API — the function stays deployable', () => {
  it('is a single file with no relative imports', () => {
    // The whole reason the routing is inlined. A relative import here bundles
    // only when the deploy uploads the folder, and the first real deploy did not.
    const relativeImports = INDEX_TS.match(/^\s*import[^\n]*from\s+['"]\.[^'"]*['"]/gm) || []
    expect(relativeImports, 'index.ts must not import local files').toEqual([])
  })

  it('rejects TypeScript annotations inside the evaluated block', () => {
    // A `: string` here would throw at module load with a syntax error that
    // points at this file rather than at the line someone actually wrote.
    expect(block).not.toMatch(/function\s+\w+\s*\([^)]*:\s*\w/)
    expect(block).not.toMatch(/^\s*(const|let)\s+\w+\s*:\s*\w/m)
  })
})

describe('registry API — version routing', () => {
  it("treats the gateway path prefix as Supabase's, not ours", () => {
    // The live pathname carries Supabase's own /functions/v1/ in front of the
    // function name. Reading that as "the API is versioned" is exactly the
    // mistake this change exists to prevent.
    expect(parseRegistryPath('/functions/v1/public-registry/v1/')).toEqual({
      kind: 'versioned',
      version: 'v1',
      resource: '',
    })
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
    expect(parseRegistryPath('/functions/v1/public-registry/projects').kind).toBe('unknown_version')
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

  it('does not throw on an empty or missing path', () => {
    expect(parseRegistryPath('')).toEqual({ kind: 'discovery' })
    expect(parseRegistryPath(undefined)).toEqual({ kind: 'discovery' })
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
  // exists only as a declaration.
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
