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
  return { CURRENT_API_VERSION, SUPPORTED_API_VERSIONS, parseRegistryPath, discoveryDocument,
           apiKeyFromAuthHeader, publicApiBaseUrl }`,
)()

const {
  CURRENT_API_VERSION,
  SUPPORTED_API_VERSIONS,
  parseRegistryPath,
  discoveryDocument,
  apiKeyFromAuthHeader,
  publicApiBaseUrl,
} = routing

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

describe('registry API — an anon JWT is not a bad API key', () => {
  /**
   * Found by probing the first successful deploy, not by reading the code.
   *
   * The handler took ANY Bearer token as an API key, so a caller sending the
   * standard Supabase anon JWT — which `supabase-js` attaches automatically —
   * got `401 Invalid or expired API key` while asking for public data it was
   * entitled to, having never presented a key.
   *
   * "No key" and "bad key" are different answers: the first means serve the
   * public tier, the second means the caller's credential is wrong.
   */
  const ANON_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.7Hk3sVQ4_fakeSignature'

  it('ignores a Supabase anon JWT so the public tier still serves', () => {
    expect(apiKeyFromAuthHeader(`Bearer ${ANON_JWT}`)).toBeNull()
  })

  it('accepts a Carbonify key', () => {
    expect(apiKeyFromAuthHeader('Bearer ck_live_abc123')).toBe('ck_live_abc123')
  })

  it('leaves room for a future ck_test_ prefix', () => {
    expect(apiKeyFromAuthHeader('Bearer ck_test_abc123')).toBe('ck_test_abc123')
  })

  it('treats a missing or non-Bearer header as anonymous', () => {
    expect(apiKeyFromAuthHeader(null)).toBeNull()
    expect(apiKeyFromAuthHeader('')).toBeNull()
    expect(apiKeyFromAuthHeader('Basic ck_live_abc')).toBeNull()
  })

  it('is case-insensitive on the scheme and trims the token', () => {
    expect(apiKeyFromAuthHeader('bearer   ck_live_abc  ')).toBe('ck_live_abc')
  })

  it('does not accept a token that merely contains the prefix', () => {
    // `startsWith`, not `includes` — a JWT whose payload happens to encode
    // "ck_" must not be mistaken for a credential.
    expect(apiKeyFromAuthHeader('Bearer not_ck_live_abc')).toBeNull()
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

/**
 * 2026-08-11 — every URL the deployed discovery document advertised was broken,
 * and this file had a green test over the same code the whole time.
 *
 * Measured against the live function:
 *
 *   served:  http://<ref>.supabase.co/public-registry/v1/?stats=1  -> 404
 *   control: https://<ref>.supabase.co/functions/v1/public-registry/v1/?stats=1 -> 200
 *
 * WHY THE EXISTING TESTS PASSED. They call `discoveryDocument()` with a
 * correctly-formed base and assert the document echoes it — and it does.
 * `discoveryDocument` was never the defect. The HANDLER built the base, from
 * `url.origin + url.pathname`, and nothing asserted anything about the value it
 * passed. **A test of the callee is not a test of the caller** — the same shape
 * as `routeAccess.test.js` asserting `/admin` carries `requiresAdmin` while
 * nothing asserted the guard reads it.
 */
describe('registry API — the discovery document points somewhere that resolves', () => {
  it('puts back the gateway prefix the runtime strips', () => {
    // `req.url`'s pathname inside the function is `/public-registry`: the
    // gateway removes `/functions/v1` before the function ever sees it, which
    // parseRegistryPath depends on. Rebuilding a PUBLIC url from it drops the
    // one segment that makes the url resolvable.
    expect(publicApiBaseUrl('https://ref.supabase.co')).toBe(
      'https://ref.supabase.co/functions/v1/public-registry',
    )
  })

  it('never downgrades the scheme, whatever the runtime reports', () => {
    // TLS terminates at the gateway, so url.origin is `http:` in the edge
    // runtime. This is the credential-bearing case: a partner copying the base
    // out of the document sends `Authorization: Bearer ck_live_…` with it.
    const base = publicApiBaseUrl('https://ref.supabase.co')
    expect(base.startsWith('https://')).toBe(true)
    expect(base).not.toMatch(/^http:/)
  })

  it('tolerates a trailing slash on the project url', () => {
    expect(publicApiBaseUrl('https://ref.supabase.co/')).toBe(
      publicApiBaseUrl('https://ref.supabase.co'),
    )
  })

  it('emits no http:// url anywhere in the served document', () => {
    const served = discoveryDocument(publicApiBaseUrl('https://ref.supabase.co'))
    const urls = [served.versionedBaseUrl, ...served.endpoints.map((e) => e.path)]
    for (const u of urls) {
      expect(u, `${u} must be https and carry the gateway prefix`).toMatch(
        /^https:\/\/[^/]+\/functions\/v1\/public-registry\/v1/,
      )
    }
  })

  it('builds the base from SUPABASE_URL, not from the request', () => {
    // The assertion that would have caught this. `url.origin` is correct for
    // routing (parseRegistryPath wants the stripped path) and wrong for anything
    // a partner is told to call, so the rule is about WHICH source, not about
    // the shape of the result.
    expect(INDEX_TS).toMatch(/discoveryDocument\(publicApiBaseUrl\(SUPABASE_URL\)\)/)
    expect(
      INDEX_TS,
      'the discovery base must not be reconstructed from the incoming request',
    ).not.toMatch(/discoveryDocument\(\s*url\.origin/)
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
