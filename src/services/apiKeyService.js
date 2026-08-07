import { getSupabase } from '@/services/supabaseClient'

/**
 * White-label API tenants and keys (admin only).
 *
 * Backed by migration 20260806000400. Every write here is an RPC, not a table
 * write, and every RPC re-checks `is_admin()` server-side — hiding the screen is
 * not the control, the function is.
 *
 * ## The one rule this module exists to enforce
 * A raw key is returned exactly once, by `issueApiKey`, and is never stored. It
 * is not in the table, so no read here can return it and no later screen can
 * show it again. If the caller loses it, the answer is to revoke and reissue.
 * Anything that made a key retrievable would also make it leakable through every
 * log line, backup and support screenshot it subsequently touched.
 */

/** Scopes the database will accept. An unknown scope is rejected, not ignored. */
export const API_SCOPES = Object.freeze([
  { value: 'registry:read', label: 'Registry (projects, stats, project detail)' },
  { value: 'mrv:read', label: 'MRV aggregates per project' },
  { value: 'certificates:read', label: 'Certificate lookup' },
])

const TENANT_COLUMNS =
  'id, slug, name, display_name, logo_url, primary_color, support_email, active, created_at'

// key_hash is deliberately absent. It is not a secret in the usable sense, but
// nothing on the client has any reason to hold it, and a column list is the
// cheapest place to make that permanent.
const KEY_COLUMNS =
  'id, tenant_id, label, key_prefix, scopes, rate_limit_per_min, ' +
  'last_used_at, expires_at, revoked_at, created_at'

function client() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase
}

// ── Pure helpers (unit-tested without a database) ──────────────────────────

/**
 * The live/expired/revoked state of a key.
 * Revocation is checked before expiry: a key that was revoked and has since also
 * passed its expiry date was revoked, and reporting it as merely "expired" would
 * describe a deliberate withdrawal as the clock running out.
 * @param {{revoked_at?: string|null, expires_at?: string|null}|null} key
 * @param {Date} [now] - injectable for testing
 * @returns {'revoked'|'expired'|'active'}
 */
export function keyState(key, now = new Date()) {
  if (!key) return 'revoked'
  if (key.revoked_at) return 'revoked'
  if (key.expires_at) {
    const expiry = new Date(key.expires_at)
    if (!isNaN(expiry) && expiry.getTime() <= now.getTime()) return 'expired'
  }
  return 'active'
}

/**
 * Validate a tenant before sending it. Returns an array of errors ([] = ok).
 * The slug rule mirrors the database CHECK exactly; duplicating it here buys a
 * readable message instead of a raw constraint violation, and the database
 * remains the thing that actually enforces it.
 * @param {{slug?: string, name?: string}} tenant
 * @returns {string[]}
 */
export function validateTenantInput(tenant = {}) {
  const errors = []
  const slug = String(tenant.slug || '').trim()
  const name = String(tenant.name || '').trim()

  if (!slug) {
    errors.push('A slug is required')
  } else if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    errors.push(
      'Slug must be 3–40 characters, lowercase letters, numbers and hyphens, and cannot start or end with a hyphen',
    )
  }
  if (!name) errors.push('A partner name is required')
  return errors
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** @returns {Promise<Array<object>>} every API tenant, newest first */
export async function listTenants() {
  const { data, error } = await client()
    .from('api_tenants')
    .select(TENANT_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load API tenants')
  return data || []
}

/**
 * @param {string} [tenantId] - restrict to one tenant
 * @returns {Promise<Array<object>>}
 */
export async function listApiKeys(tenantId = null) {
  let query = client()
    .from('api_keys')
    .select(KEY_COLUMNS)
    .order('created_at', { ascending: false })

  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Failed to load API keys')
  return data || []
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Create or update a tenant, keyed on slug.
 * @param {object} tenant
 * @returns {Promise<string>} the tenant id
 */
export async function saveTenant(tenant) {
  const errors = validateTenantInput(tenant)
  if (errors.length) throw new Error(errors.join('. '))

  const { data, error } = await client().rpc('upsert_api_tenant', {
    p_slug: String(tenant.slug).trim().toLowerCase(),
    p_name: String(tenant.name).trim(),
    p_display_name: tenant.display_name || null,
    p_logo_url: tenant.logo_url || null,
    p_primary_color: tenant.primary_color || null,
    p_support_email: tenant.support_email || null,
    p_active: tenant.active !== false,
  })

  if (error) throw new Error(error.message || 'Failed to save the tenant')
  return data
}

/**
 * Issue a key. The returned `api_key` is the ONLY copy — show it once, then let
 * it go. Nothing can retrieve it afterwards.
 * @param {{tenantId: string, label?: string, scopes?: string[], ratePerMin?: number, expiresAt?: string|null}} input
 * @returns {Promise<{key_id: string, api_key: string, key_prefix: string}>}
 */
export async function issueApiKey({
  tenantId,
  label = '',
  scopes = ['registry:read'],
  ratePerMin = 60,
  expiresAt = null,
}) {
  if (!tenantId) throw new Error('A tenant is required')
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('At least one scope is required')
  }

  const { data, error } = await client().rpc('create_api_key', {
    p_tenant_id: tenantId,
    p_label: label || null,
    p_scopes: scopes,
    p_rate_limit_per_min: Number(ratePerMin) || 60,
    p_expires_at: expiresAt || null,
  })

  if (error) throw new Error(error.message || 'Failed to issue the API key')
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.api_key) throw new Error('The key was created but not returned. Revoke it and retry.')
  return row
}

/**
 * @param {string} keyId
 * @returns {Promise<boolean>} true if a live key was revoked
 */
export async function revokeApiKey(keyId) {
  if (!keyId) throw new Error('A key is required')
  const { data, error } = await client().rpc('revoke_api_key', { p_key_id: keyId })
  if (error) throw new Error(error.message || 'Failed to revoke the key')
  return data === true
}
