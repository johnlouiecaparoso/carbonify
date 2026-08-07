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

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform. Without the service key the function still serves the anonymous
tier — keys cannot be authenticated and the limiter fails open, so keyed
endpoints return 401 and `?mrv=` returns 500.

## Endpoints

| Request | Scope required | Returns |
|---|---|---|
| `GET /public-registry` | — | validated projects, paginated |
| `GET /public-registry?page=1&search=biochar&category=…` | — | filtered listing |
| `GET /public-registry?stats=1` | — | headline registry stats |
| `GET /public-registry?project=<uuid>` | — | one validated project, full registry detail |
| `GET /public-registry?certificate=<serial>` | `certificates:read` when keyed | certificate verification |
| `GET /public-registry?mrv=<uuid>` | `mrv:read` | per-project MRV aggregates |

`page` is 0-based; the page size is 20.

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

- **Versioning** — freeze the response shape under `/v1/` before external
  consumers depend on it. Tracked in `docs/DEFERRED_BACKLOG.md`.
- **Redistribution terms** — what a white-label partner may republish is a
  contract question, not a code one.
