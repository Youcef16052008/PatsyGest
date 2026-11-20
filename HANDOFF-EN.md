# PâtisGest — Handoff (English)

**Audience:** a senior engineer or an AI agent picking this repository up cold,
with no access to the conversation that produced it.
**Purpose:** explain *what* was built, *why*, *what was deliberately not built*,
and *what would break if you trust the obvious assumptions*.

Written 2026-11-19. Branch `arena/9d585bf7-patsygest`, head `ec00dbe`,
merged into `main` via PR #6.

> The repository's working language is French (UI, code comments, commit
> messages, `README.md`, `HANDOFF.md`). This document is the English entry
> point; it does not replace `patisgest-app/README.md` §5–6, which stay the
> authoritative technical detail.

---

## 1. The product, in one paragraph

PâtisGest is management software for Algerian pastry shops (stock, production,
cash register, food-safety logs, custom-cake orders). It is a Next.js 16 app
(`patisgest-app/`) on Supabase, working **offline**, sold as a subscription
(~2 900 DA/month) to shops that may have no reliable internet.

The work in this handoff adds the **public storefront**: each shop gets its own
public page (`elyasmine.patisgest.dz`, fallback `/vitrine/elyasmine`) listing the
cakes it chooses to show, with an order-request form that takes **no payment
online**.

---

## 2. Why this work happened, and what the client actually asked

The requirements are unusually precise because they come from the shop owner,
not from a spec writer. Verbatim intent, preserved because each line drives a
design decision:

| # | Requirement (client's words, paraphrased) | Consequence in the code |
|---|---|---|
| 1 | **Every shop gets its own storefront**, not one shared page | `sites.subdomain` + host-based routing (`src/lib/domaines.ts`) |
| 2 | **Photos:** owner *and* lab. **Add/remove a recipe:** owner *only*. **Seller:** may only accept or refuse a request | `src/lib/vitrine-permissions.ts` — permissions are a data table, not scattered `if`s |
| 3 | Orders from the storefront are **not paid online**; staff accept or refuse; **no duplicate** if the customer submits twice | `patisgest_demander_commande` + browser idempotency key + unique index |
| 4 | **Never display a price of 0** — show "prix sur demande" | `libellePrix()` in `src/lib/vitrine-format.ts` |
| 5 | Validate features **end to end** before selling any paid subscription | This is why so much of the work below is *verification*, not *features* |

Requirement 5 is the one that shaped the whole engagement. The client explicitly
refused to take money before the thing works. Several "obvious" features were
therefore **not** built on purpose (see §7).

---

## 3. What was built

### 3.1 Offline mode (NF-02) — `c378f95`

Service worker (`public/sw.js`) + `src/lib/catalogue-cache.ts`, a manifest, and
icons. The sale form (`sale-form.tsx`) survives a network drop: the sale is
queued locally and replayed, so a cashier is never blocked by a dead connection.
This was a blocker for the product being sellable at all — a pastry shop in Oran
loses internet several times a day.

**Trap found here:** a service worker must never cache `/api/*`. Caching an auth
or export route makes the app serve a stale response forever.

### 3.2 Storefront, database side — migrations 25→31

Seven migrations, all applied to the pilot database (`evepzygucfxarpdnflzv`),
all idempotent and re-runnable.

| Migration | What it does | Why it exists |
|---|---|---|
| `25-domaines-boutiques.sql` | `sites.subdomain`, `sites.custom_domain`, `sites.publication`, reserved-name table, `patisgest_reserver_sous_domaine` | Host-based routing needs a per-shop key |
| `26-vitrine-publique.sql` | View `vitrine_catalogue` + `visible_vitrine` / `nom_vitrine` / `description_vitrine` / `ordre_vitrine` on `recette_familles`; unique index on `cakes.cle_vitrine` | The **only** thing an anonymous visitor may read |
| `27-commandes-vitrine.sql` | `patisgest_demander_commande` (anon) + `patisgest_traiter_demande` (staff) | Ordering without granting `anon` any write access |
| `28-fermeture-anon.sql` | `anon` loses all table privileges | Second lock, before the first public page exists |
| `29-fermeture-public-fonctions.sql` | Revoke `EXECUTE` from `PUBLIC` on helper functions | Migration 28 alone revoked nothing — see §5.3 |
| `30-edition-vitrine-rpc.sql` | RPCs for editing the storefront catalogue | The `recettes` RLS policy is wider than the storefront rule |
| `31-publication-vitrine.sql` | `patisgest_publier_vitrine` — owner only, refuses with no subdomain or no visible recipe | `sites_update_staff` allows owner **and** lab |

### 3.3 Storefront, application side — `637172c`, `bc685f3`

- `src/lib/domaines.ts` — pure `resoudreHote()` / `deciderRoutage()`: classifies a
  `Host` header as `application` / `boutique` / `domaine-client` / `inconnu`.
  Tested with 8 cases (port, trailing dot, case, localhost). **It decides
  nothing about access** — it only classifies.
- `middleware.ts` (**at the `patisgest-app/` root, not in `src/`**) — routes on
  host, then refreshes the Supabase session with a 1.2 s race and a try/catch.
- `src/lib/vitrine.ts` — `lireVitrinePublique()` reads **only** `vitrine_catalogue`;
  `construireVitrine()` is pure and unit-tested.
- `src/app/(vitrine)/vitrine/[slug]/page.tsx` — `force-dynamic`, no session, slug
  from `params` or from `Host`.
- `src/components/vitrine-commande.tsx` — visitor form, idempotency key frozen by
  `useState(() => …)`.
- `src/components/vitrine-form.tsx` + `(app)/parametres/page.tsx` — the admin
  panel, buttons driven by `peutVitrine(role, …)`.

### 3.4 The seller's half of the flow — `ec00dbe`

**The most important fix in this handoff.** The visitor flow was complete and
tested. The seller flow was not.

`patisgest_traiter_demande` (RPC), `traiterDemandeVitrine` (server action) and
`peutTraiterDemande` (rule) all existed and were covered by tests — but **no
screen called them**. A request landed with status `demande`, and the Cake Design
screen only offered the quote transitions (`payer / confirmer / produire /
livrer / annuler`). The request was therefore **permanently stuck**: the customer
believed they had ordered, and nobody could answer them.

Fixed by an "Demandes de la vitrine" panel at the top of Cake Design, separate
from quotes (a request has neither price nor deposit), with **Accept → quote** and
**Refuse** buttons gated by `peutTraiterDemande(role)`.

Accepting sets the status to `devis` and **does not invent a price** — the staff
prices it afterwards. That was requirement 3: no payment online, no price decided
by the customer or by the code.

---

## 4. How it was verified (and where)

This matters for the next person, because **the sandbox cannot reach Supabase**.
There is no outbound network to `*.supabase.co` from the dev sandbox. Any HTTP
test of the storefront has to happen either:

- **in SQL**, inside `begin; … rollback;` — most of the verification was done
  this way;
- **on the Vercel preview**, which *can* reach the database.

### 4.1 Security posture, measured not assumed

Before this work `anon` (the public key, shipped in the browser) held full DML on
`cakes`, `articles`, `sites`, `recette_familles`… RLS saved it, but by a single
lock. Measured afterwards:

- `anon` → **1 view** (`vitrine_catalogue`) + **1 function**
  (`patisgest_demander_commande`);
- `authenticated` → 42 RPCs + DML on the tables it needs.

### 4.2 End-to-end, against the real database

| Check | Result |
|---|---|
| Visitor submits a request | row created, `statut='demande'`, `prix_ht='0.00'` |
| Same idempotency key replayed | **1** row, not 2 |
| Request for an unpublished recipe | refused: "Cette recette n'est pas proposée…" |
| Name `'A'` (too short) | refused: "Votre nom est requis (2 à 100 car…)" |
| 31st request in one hour | refused: "Trop de demandes en peu de temps…" |
| Seller accepts | `devis`, `prix_ht` still 0, note "à chiffrer" |
| Seller refuses | `annule` |
| Replay on an already-processed request | refused: "déjà été traitée" |
| Publish with no subdomain / no visible recipe | refused |
| Lab or seller tries to publish | refused: "Seul le propriétaire…" |

The storefront was also **rendered for real** on the Vercel preview once
published: title, cake card, "260 DA / pcs", order section, "Photo à venir" —
proof that the deployment reaches the live database.

### 4.3 Gates at merge time

`tsc` · `eslint` · **318** unit tests · **21** HTTP smoke tests · `next build`
(all green). The database was then **returned to a safe state**: 0 published
sites, 0 visible recipes, 0 storefront orders.

---

## 5. Seven things that will bite you (all were real here)

These are not hypotheticals. Each one cost time during this engagement.

### 5.1 A client component cannot import `src/lib/vitrine.ts`
It pulls in `next/headers`. The build fails with *"`next/headers` not supported in
Client Components"*. Use `src/lib/vitrine-format.ts`, which has **zero imports**,
and let `vitrine.ts` re-export it.

### 5.2 `next-env.d.ts`
Next.js rewrites this file on every build. Never commit the churn; check it out.

### 5.3 Revoking `EXECUTE` from `anon` removes nothing
PostgreSQL grants `EXECUTE` to **`PUBLIC`** by default, and `anon` inherits from
`PUBLIC`. You must revoke from `PUBLIC`. Migration 29 exists for exactly this;
migration 28's revoke on `anon` alone was cosmetic.

### 5.4 A public page must not reuse internal reads
`lireVitrinePublique` reads one view. If you "simplify" it by reusing
`workspace-read` or `recette_versions`, you leak costs and margins to anonymous
visitors — and you trigger a login redirect.

### 5.5 A route `/[slug]` at the app root breaks the build
It collides with `/[module]` ("Ambiguous app routes"). The storefront lives under
`/vitrine/[slug]`; the middleware rewrites `slug.patisgest.dz/` to that path.
Nested dynamic segments in Next.js don't accept a partial slug the way you'd
expect — don't try to be clever.

### 5.6 `schema.ts` was **wrong about the database**
Two errors found only by querying `information_schema` and `pg_constraint`:
- 7 columns were missing from the `cakes` definition (`tva_pct`, `paiements`,
  `cgv_accepted_at`, `cgv_version`, `version_id`, `qte_fabrication`, `of_id`);
- `origine` defaulted to `'manuel'`, but the constraint `cakes_origine_valeurs`
  only admits `interne | vitrine`. Any insert would have failed at runtime.

**Lesson:** this drizzle schema is documentation, not the source of truth. The
database is. Verify with `information_schema.columns` before trusting it.

### 5.7 SQL via the connector is **not transactional**
`execute_query` does not wrap your statement. Two test `update`s were left
applied to the pilot database. Always `begin; … rollback;` for an experiment.
Also: an *expected* SQL error comes back as a **tool failure** — the message after
`ERROR:` is your test result, not a malfunction. Don't retry it.

---

## 6. Where things are

```
patisgest-app/
  middleware.ts                    # host routing (ROOT, not src/)
  src/lib/domaines.ts              # pure host → boutique classification
  src/lib/vitrine.ts               # public read (view only) + pure builder
  src/lib/vitrine-format.ts        # pure, zero imports (client-safe)
  src/lib/vitrine-permissions.ts   # role rules, tested
  src/lib/actions-vitrine.ts       # "use server" actions
  src/components/vitrine-form.tsx  # admin panel (Paramètres → Vitrine)
  src/components/vitrine-commande.tsx  # visitor form
  src/components/cake-forms.tsx    # ← seller flow, incl. request panel
  src/app/(vitrine)/vitrine/[slug]/    # public page
  src/app/(app)/parametres/page.tsx    # mounts the admin panel
  supabase/25…31                   # storefront schema, all applied
  tests/vitrine.test.mjs           # 24 business-rule tests
  tests/securite.test.mjs          # 24 posture tests
  tests/domaines.test.mjs          # 8 routing tests
```

Supporting notes (French): `NOTE-HEBERGEMENT.md` (hosting, §9.3.1 = how to
actually turn on `*.patisgest.dz`), `NOTE-COUT-MINIMAL.md` (costs, §6 = what the
real schema corrected), `patisgest-app/README.md` §6.

---

## 7. Deliberately **not** done — and why

Do not "helpfully" add these without discussing them:

- **A shared storefront page.** Explicitly rejected by the client.
- **Online payment.** Explicitly out of scope; staff accept/refuse, a quote is
  priced by hand.
- **Paying customers / subscriptions.** The client's own instruction: prove it
  works end to end first.
- **`*.patisgest.dz` DNS.** The code routes by host and is unit-tested, but **no
  custom domain is attached to Vercel**. `list_project_domains` returns only
  `patsy-gest.vercel.app`. The subdomain path has never run against real DNS.
  Procedure and the three checks to perform are in `NOTE-HEBERGEMENT.md` §9.3.1.
- **A hardcoded role comparison in the UI.** The permissions module exists so
  that screens don't grow `if (role === 'vendeur')`. A test fails if you do.

---

## 8. Open items, honestly

| Item | State |
|---|---|
| Merge PR #6 into `main` | Done in this handoff |
| Production `patsy-gest.vercel.app` | Was serving `f11e371` (pre-storefront) before the merge; check the post-merge deployment |
| `*.patisgest.dz` on Vercel | **Not configured** — no DNS, no wildcard certificate |
| Subdomain routing against real DNS | **Never executed** — unit tests only |
| Field validation (real backup/restore, a full offline day, cost review with three pastry chefs, timed onboarding) | **Not done** — see `GUIDE-PILOTE.md` |
| `supabase/09-journaux-ecritures.sql` | **Obsolete**, superseded — do not apply |
| `supabase/24-index-exploitation.sql` | Restored to the repo, **not applied** |

---

## 9. The honest one-liner

The storefront works, is secured for anonymous visitors, and has been exercised
against the real database — but only through a Vercel preview and SQL, never
through a real subdomain, and never with a real customer. It is ready to be
demonstrated and merged; it is not yet proven in the field.
