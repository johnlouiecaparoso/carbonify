/**
 * Path routing for the Registry API — kept separate from `index.ts` so it can be
 * unit-tested directly rather than grepped for as source text.
 *
 * ## Why there are two "v1"s in a partner's URL
 *
 *   https://<ref>.supabase.co/functions/v1/public-registry/v1/?stats=1
 *                                      ^^                  ^^
 *                                      |                   Carbonify's contract
 *                                      Supabase's gateway contract
 *
 * The first belongs to Supabase and we do not control it. The second is ours: it
 * is the promise that the response shape a partner integrated against will not
 * change under them. Conflating the two — which is what reading the gateway's
 * `/functions/v1/` as "the API is versioned" would do — leaves our own shape
 * frozen by nothing.
 *
 * ## The unversioned root serves no data, on purpose
 *
 * `GET /public-registry` returns a discovery document naming the current version
 * and where to find it. It deliberately returns **no registry data**, because a
 * root that serves data is the path partners will integrate against — and then
 * the version prefix exists while protecting nothing. Backlog #50 asked for the
 * shape to be frozen before the first partner, not for a prefix to be available.
 *
 * The discovery document is itself the one endpoint with no compatibility
 * promise; it exists to be read once by a human.
 */

export const CURRENT_API_VERSION = 'v1'

/** Every version this deployment still answers. Add to it; never repurpose one. */
export const SUPPORTED_API_VERSIONS: readonly string[] = ['v1']

/**
 * The Supabase gateway prefixes every request with `/functions/v1/<name>`, so the
 * pathname the function sees contains its own name. Everything after that segment
 * is the API's own path.
 */
const FUNCTION_SEGMENT = 'public-registry'

export type RegistryRoute =
  /** The unversioned root — serve discovery, never data. */
  | { kind: 'discovery' }
  /** A supported version. `resource` is '' for the query-parameter API. */
  | { kind: 'versioned'; version: string; resource: string }
  /** A version prefix this deployment does not answer. */
  | { kind: 'unknown_version'; received: string }

export function parseRegistryPath(pathname: string): RegistryRoute {
  const segments = pathname.split('/').filter(Boolean)

  // `indexOf`, not `lastIndexOf`: the first occurrence is the gateway naming the
  // function. Anything after it belongs to us.
  const at = segments.indexOf(FUNCTION_SEGMENT)
  const rest = at === -1 ? segments : segments.slice(at + 1)

  if (rest.length === 0) return { kind: 'discovery' }

  const [version, ...resource] = rest
  if (!SUPPORTED_API_VERSIONS.includes(version)) {
    return { kind: 'unknown_version', received: version }
  }

  return { kind: 'versioned', version, resource: resource.join('/') }
}

/**
 * What the unversioned root returns. Endpoints are listed relative to the
 * versioned base so a reader can concatenate without guessing.
 */
export function discoveryDocument(baseUrl: string) {
  const base = `${baseUrl.replace(/\/+$/, '')}/${CURRENT_API_VERSION}`
  return {
    service: 'Carbonify Registry API',
    currentVersion: CURRENT_API_VERSION,
    supportedVersions: SUPPORTED_API_VERSIONS,
    versionedBaseUrl: base,
    note:
      'This root serves no registry data. Call the versioned base so the response ' +
      'shape you integrate against stays stable.',
    endpoints: [
      { method: 'GET', path: `${base}/`, scope: null, returns: 'validated projects, paginated' },
      {
        method: 'GET',
        path: `${base}/?page=1&search=biochar&category=…`,
        scope: null,
        returns: 'filtered listing (page is 0-based, page size 20)',
      },
      { method: 'GET', path: `${base}/?stats=1`, scope: null, returns: 'headline registry stats' },
      {
        method: 'GET',
        path: `${base}/?project=<uuid>`,
        scope: null,
        returns: 'one validated project',
      },
      {
        method: 'GET',
        path: `${base}/?certificate=<serial>`,
        scope: 'certificates:read when keyed',
        returns: 'certificate verification',
      },
      {
        method: 'GET',
        path: `${base}/?mrv=<uuid>`,
        scope: 'mrv:read',
        returns: 'per-project MRV aggregates',
      },
    ],
    authentication:
      'Anonymous for the public tier. White-label partners send Authorization: Bearer ck_live_…',
    documentation: 'https://github.com/johnlouiecaparoso/carbonify/blob/main/supabase/functions/public-registry/README.md',
  }
}
