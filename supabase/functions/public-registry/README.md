# Public Registry API

Read-only JSON API over the public carbon registry (validated projects + stats).
A white-label / integration scaffold: partners and LGU/city front-ends can pull
the registry without the Carbonify SPA.

## Deploy

```bash
supabase functions deploy public-registry --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform.

## Use

```
GET /public-registry                 # validated projects (paginated)
GET /public-registry?page=1
GET /public-registry?search=biochar&category=Biochar%20%26%20Bio-briquettes
GET /public-registry?stats=1         # headline stats
```

Example:

```bash
curl "https://YOUR_PROJECT.functions.supabase.co/public-registry?stats=1"
```

## Security & scope — owner decisions before production

This is a **scaffold**. It is safe as-is (anon key → RLS → only already-public
rows; no writes), but before advertising it as a paid or white-label product:

- **API keys**: add an `api_keys` table and require a key header, so usage is
  attributable and revocable.
- **Rate limiting / quotas**: per-key limits to protect the database.
- **Versioning**: freeze the response shape under `/v1/` before external
  consumers depend on it.
- **Terms**: decide what data white-label partners may redistribute.

Tracked in `docs/GAP_ANALYSIS.md`.
