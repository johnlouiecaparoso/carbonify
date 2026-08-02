# Vercel — redeploying, deleting the spare project, and pinning the domain

> **Written 2026-08-02**, for the redeploy where the second Vercel project (`ecolink`) is removed and
> a final domain is chosen. The question that prompted it: *"will the link get renamed to the GitHub
> comment/branch?"*

## The short answer

**A custom domain is never renamed by anything in git.** Not by a branch name, not by a commit
message, not by a PR title. Once `yourdomain.com` is added under **Settings → Domains** and assigned
to **Production**, it points at whatever the production branch last built, and its name never
changes unless you change it.

What you almost certainly saw is a **branch URL**, which is a different thing.

## The three URLs Vercel gives every project

| # | Shape | Example | Changes when? |
|---|---|---|---|
| 1 | `<project>.vercel.app` | `carbonify13.vercel.app` | Only if you rename the **Vercel project** |
| 2 | `<project>-git-<branch>-<scope>.vercel.app` | `carbonify13-git-fix-mobile-cart-and-earnings-…` | **Every branch gets its own** — this is the one that looks "renamed" |
| 3 | `<project>-<hash>-<scope>.vercel.app` | `carbonify13-k3f9x2a-…` | Every single deployment |
| 4 | Your custom domain | `carbonify.ph` | **Never, unless you change it** |

Today's branches were `feature-user-onboarding-ux` and `fix-mobile-cart-and-earnings`. A #2 URL
built from either of those reads exactly like "the link got renamed to a GitHub comment". It is
normal, it only ever applies to **preview** deployments, and it cannot affect production or a custom
domain.

> **None of #1–#3 is derived from GitHub metadata.** #2 uses the *branch name*, which is the only
> git-derived part of any Vercel URL. Commit messages and PR titles appear nowhere in a hostname.

## ⚠️ Before you deploy from this folder

`.vercel/repo.json` in this checkout is linked to the **`ecolink`** project — the one you intend to
delete — **not** `carbonify13`:

```json
{ "projects": [ { "name": "ecolink", "id": "prj_InGh0NaNH7BArKKwTdnF4mXyRAjE", … } ] }
```

So `vercel` or `vercel --prod` run from here deploys to the wrong project. It is gitignored, so this
is local-only and safe to remove:

```bash
rm -rf .vercel      # then `vercel link` and pick the right project if you use the CLI
```

If you deploy only through the GitHub integration (which is what has been happening), you can delete
the folder and never think about it again.

## Order of operations — the one that can bite

A domain can belong to **one Vercel project at a time**. If you are moving to a different project,
release it from the old one first, or Vercel will refuse to add it.

1. Deploy and confirm the **new/kept** project builds from `main`.
   Settings → Git → **Production Branch = `main`**.
2. Copy every environment variable across **before** pointing the domain (next section). A project
   with no env vars builds fine and then fails at runtime.
3. Old project: Settings → Domains → **remove** the domain.
4. New project: Settings → Domains → **add** it, assign to Production.
5. Only then delete the project you no longer want.

> Deleting a project releases its domains automatically — but it also deletes the deployment history
> and any environment variables on it. Do step 2 first.

## Environment variables — the usual reason a fresh project breaks

The app reads these at **build** time (Vite inlines `VITE_*`), so they must exist on the Vercel
project before the build, not after:

| Variable | Needed | If missing |
|---|---|---|
| `VITE_SUPABASE_URL` | **Required** | `getSupabase()` returns null → nothing loads |
| `VITE_SUPABASE_ANON_KEY` | **Required** | same |
| `VITE_PAYMONGO_PUBLIC_KEY` | Required for checkout | payment flows fail |
| `VITE_SUPABASE_FUNCTIONS_URL` | Optional | falls back to the project-ref default |
| `VITE_SUPABASE_PROJECT_REF` | Optional | used only to build the functions URL |
| `VITE_SENTRY_DSN` | Optional | error tracking stays dormant (by design) |
| `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_TRACES_SAMPLE_RATE` | Optional | Sentry defaults |
| `VITE_GA_TRACKING_ID` | Optional | analytics off |

Set them for **Production, Preview and Development** unless you deliberately want previews pointed
elsewhere.

## After the domain is final — three things outside Vercel

These are the ones that break silently, because the app itself is domain-agnostic:

1. **Supabase → Authentication → URL Configuration.** Set **Site URL** to the new domain and add it
   to **Redirect URLs**. Password reset, email confirmation and OAuth callbacks all redirect through
   this allowlist — a stale entry means the link in the email lands on the old host or is rejected.
2. **`index.html` social meta.** `og:url` and `og:image` currently say `https://carbonify.app`, which
   the platform does not own. Link previews will point at a domain that is not yours.
3. **PayMongo webhook** — no change needed. It points at a Supabase edge function
   (`…supabase.co/functions/v1/paymongo-webhook`), not at Vercel.

> **Not on this list, deliberately:** certificates. The verification URL and its QR code are built
> from `window.location.origin` at download time, so they follow the domain automatically. One
> hardcoded `https://carbonify.com/verify` in the text-file fallback was fixed on 2026-08-02 — it
> would have printed a dead verification address onto a document a holder might hand to an auditor.

## `ci.yml`'s deploy job

It has never run. `amondnet/vercel-action` fails on its first input:

```
Input required and not supplied: vercel-token
```

`VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` have never been set as repository secrets.
Deploys come from the **GitHub integration** instead, which is why production updates despite the red
X on `main`.

**Recommendation: delete the job.** Keeping both would deploy twice per push, and the `VERCEL_PROJECT_ID`
secret would have to be updated by hand every time the project changes — a second place for the
deployment target to drift. If you would rather keep it, set the three secrets and confirm it does
not double-deploy alongside the integration.
