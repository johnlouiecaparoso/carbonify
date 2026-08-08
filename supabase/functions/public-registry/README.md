# Carbonify Registry API

Read-only JSON API over the carbon registry, in two tiers:

- **Anonymous** — validated projects and headline stats. Public data, IP rate
  limited, no branding. This tier is unauthenticated *on purpose*: the public
  registry is a transparency claim, and putting a key in front of it would
  retract that claim.
- **Keyed (white-label)** — `Authorization: Bearer ck_live_…`. Adds tenant
  branding to every response, the per-key rate limit the partner is paying for,
  and the scoped endpoints below.

Backed by migration `20260806000400_api_tenants_and_keys.sql`.

## Deploy

```bash
supabase functions deploy public-registry --no-verify-jwt
```

The function is **two files** — `index.ts` and `routing.ts`. `supabase functions
deploy` bundles the whole directory, so this is the same one command; it is worth
knowing only if you ever copy a single file somewhere by hand.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform. Without the service key the function still serves the anonymous
tier — keys cannot be authenticated and the limiter fails open, so keyed
endpoints return 401 and `?mrv=` returns 500.

## Versioning

Everything that returns data lives under **`/v1/`**. The unversioned root returns
a discovery document and **no registry data at all**:

```
GET /public-registry        → { currentVersion, versionedBaseUrl, endpoints… }
GET /public-registry/v1/    → the API
GET /public-registry/v2/    → 404 { supportedVersions: ["v1"] }
```

A partner's full URL therefore contains two version segments:

```
https://<ref>.supabase.co/functions/v1/public-registry/v1/?stats=1
                                    ^^                  ^^
                                    Supabase's gateway  Carbonify's contract
```

Only the second one is ours. The root serves no data **on purpose** — a root that
returns projects is the URL partners integrate against, and then the prefix
exists while protecting nothing.

Every response under `/v1/` carries `apiVersion: "v1"` in the body and an
`X-Carbonify-Api-Version: v1` header, so a client can assert on either.

**What a v2 would mean:** any change that could break a caller parsing v1 —
removing or renaming a field, changing a type, changing pagination. Adding a new
optional field does not. When v2 arrives, v1 stays served from
`SUPPORTED_API_VERSIONS` until partners have migrated.

## Endpoints

| Request | Scope required | Returns |
|---|---|---|
| `GET /public-registry` | — | discovery document (no data) |
| `GET /public-registry/v1/` | — | validated projects, paginated |
| `GET /public-registry/v1/?page=1&search=biochar&category=…` | — | filtered listing |
| `GET /public-registry/v1/?stats=1` | — | headline registry stats |
| `GET /public-registry/v1/?project=<uuid>` | — | one validated project, full registry detail |
| `GET /public-registry/v1/?certificate=<serial>` | `certificates:read` when keyed | certificate verification |
| `GET /public-registry/v1/?mrv=<uuid>` | `mrv:read` | per-project MRV aggregates |

`page` is 0-based; the page size is 20. A path under `/v1/` that is not this
query-parameter form — `/v1/projects`, say — returns 404 rather than falling
through to the listing, so it cannot become a second unintended contract.

Every response from a keyed call carries a `tenant` block:

```json
{
  "projects": [ … ],
  "tenant": {
    "slug": "acme-energy",
    "name": "Acme Energy",
    "displayName": "Acme Carbon Registry",
    "logoUrl": "https://…",
    "primaryColor": "#0f766e",
    "supportEmail": "support@acme.example",
    "scopes": ["registry:read", "mrv:read"]
  }
}
```

That block is what makes this white-label: one deployment renders under a
partner's name from data, rather than a build per partner.

## Issuing keys

**Admin → White-label API** (`/admin/api-keys`). Create a partner, then issue a
key with its scopes, rate limit and optional expiry.

The raw key is displayed **once**. Only a SHA-256 digest is stored, so it cannot
be recovered — a lost key is revoked and reissued. Revocation is immediate and
keeps the key's usage history.

By SQL, as an admin:

```sql
select public.upsert_api_tenant('acme-energy', 'Acme Energy', 'Acme Carbon Registry');
select * from public.create_api_key(
  (select id from public.api_tenants where slug = 'acme-energy'),
  'Production', array['registry:read','mrv:read'], 120, null);
```

## Scopes

| Scope | Grants |
|---|---|
| `registry:read` | projects, stats, project detail |
| `certificates:read` | certificate lookup by serial |
| `mrv:read` | per-project MRV aggregates (issued, retired, removed/avoided split) |

An unknown scope is **rejected** at key creation, not ignored — silently dropping
it would issue a key the buyer believes grants something it does not.

All scopes are read-only. There is deliberately no write scope: partner writes
mean idempotency, authorship and audit attribution, which is a much larger design
than this, and inventing it speculatively would be inventing an attack surface.

## Rate limits

Per key, per minute, set when the key is issued (default 60) — it is a price
tier, not a safety valve. Anonymous callers share 60/minute per IP. Over limit
returns `429` with `Retry-After`.

The limiter is the shared `check_rate_limit` from `20260704000000` and **fails
open**: if it cannot be reached, requests are allowed. A limiter outage must not
become an API outage.

## Security notes

- Anonymous reads use the **anon key**, so RLS decides what is visible and only
  already-public rows are ever returned. The **service key** is used for exactly
  two things — authenticating a key and serving the scoped RPCs — and never to
  widen an anonymous read.
- Unknown, revoked, expired, and inactive-tenant keys all return the **same
  401**. A distinguishable response would confirm which keys exist.
- `?mrv=` on an unvalidated or absent project returns the same **404**, so it
  cannot be used to discover unpublished projects.
- `authenticate_api_key` and `api_project_mrv_summary` are granted to
  `service_role` only. Reaching either from a browser would be free access to
  the product being sold.

## Still open

- ~~**Versioning**~~ — ✅ done 2026-08-08, before the first partner and before the
  function was ever deployed, which is the cheapest this could ever have been.
- **Redistribution terms** — what a white-label partner may republish is a
  contract question, not a code one. This should exist before the first key is
  issued outside the company.
- **Usage metering for billing** — `last_used_at` and the rolling limiter counter
  are not a billable record. Backlog #51.
