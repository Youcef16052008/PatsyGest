# PâtisGest — inventaire complet des variables d'environnement

Document de référence : **toutes** les variables lues par le dépôt, où qu'elles
soient lues (application Next.js, scripts, tests, workflows GitHub Actions,
prototype `design-studio`). Aucune valeur secrète ne figure ici.

**Le fichier à remplir est unique : `patisgest-app/.env.local`** (ignoré par Git).
Il contient déjà les valeurs publiques de production et des secrets de
développement ; les valeurs sensibles de production se récupèrent avec :

```bash
cd patisgest-app
npx vercel link
npx vercel env pull .env.local --environment=production
```

Légende — **Portée** : `app` (runtime Next.js), `ci` (GitHub Actions),
`test` (poste local / CI), `outil` (script hors application).
**Obl.** : `O` obligatoire, `R` recommandé, `—` optionnel.

---

## 1. Application — lectures publiques (embarquées dans le bundle)

| Variable | Portée | Obl. | Sensible | Défaut | Rôle / lecture |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app | O | non | — | URL du projet Supabase. `lib/supabase/{client,server,admin}.ts`, `proxy.ts`, `/api/health/stack` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | O | non | — | Clé anon (publique par conception). Mêmes fichiers + `lib/vitrine.ts` |

## 2. Application — serveur uniquement

| Variable | Portée | Obl. | Sensible | Défaut | Rôle / lecture |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | app | R | **oui** | — | Espace `/master`, `/api/cron/connectivite`, sonde `/api/health/stack`, `lib/supabase/admin.ts` |
| `PATISGEST_MASTER_EMAIL` | app | R | **oui** | — | Identifiant de l'administrateur Master (`lib/master-auth.ts`, `/master`) |
| `PATISGEST_MASTER_KEY` | app | R | **oui** | — | Clé Master **et** graine de signature des licences si aucune clé dédiée (`lib/master-auth.ts`, `lib/trial-crypto.ts`) |
| `CRON_SECRET` | app + ci | R | **oui** | — | Jeton Bearer du cron (`/api/cron/connectivite`) et des sondes (`/api/health/stack`). Doit être identique dans Vercel et GitHub Actions |
| `VITRINE_SECRET_ANTI_ABUS` | app + ci | O en prod | **oui** | — | Anti-abus des commandes vitrine par source. ≥ 32 car. ; en prod, absent ⇒ commandes publiques refusées (`lib/vitrine-anti-abus.ts`, `commander/actions.ts`) |
| `PATISGEST_DOMAINE` | app | — | non | `patisgest.dz` | Domaine racine des vitrines `<slug>.<domaine>` (`proxy.ts`, paramètres établissement, `actions-vitrine.ts`) |
| `PATISGEST_OFFLINE_ALERT_MINUTES` | app | — | non | `60` | Seuil d'alerte de déconnexion (minutes, plancher 60) — `lib/connectivite-cron.ts` |
| `PATISGEST_MASTER_PHONE` | app | — | oui | — | Numéro E.164 du Master pour les alertes SMS/WhatsApp (`/master`, `(app)/layout.tsx`, `connectivite-cron.ts`) |
| `PATISGEST_LICENSE_PRIVATE_JWK` | app | — | **oui** | — | Clé JWK privée ECDSA P-256 de signature des licences (`lib/trial-crypto.ts`) |
| `PATISGEST_LICENSE_PRIVATE_KEY` | app | — | **oui** | — | Variante PEM de la clé de signature ; prioritaire sur la JWK |

Ordre de repli de la graine de signature : `PATISGEST_LICENSE_PRIVATE_KEY` →
`PATISGEST_MASTER_KEY` → `VITRINE_SECRET_ANTI_ABUS` → `PATISGEST_DEMO_SECRET`
(dernier recours = graine de développement publique, donc en production
`PATISGEST_MASTER_KEY` doit **toujours** être défini).

## 3. Drapeaux fonctionnels

| Variable | Portée | Obl. | Sensible | Défaut | Rôle / lecture |
|---|---|---|---|---|---|
| `PATISGEST_MODE_GRATUIT` | app | — | non | `1` | `1` = tout gratuit, aucun essai/verrou/paiement. `0` = réouvre l'essai et le verrou serveur de `lib/auth.ts` |
| `PATISGEST_DEMO_MODE` | app | — | non | absent | `true` = sessions pilotes locales sans Supabase. **Ignoré en production** (`NODE_ENV`), refusé si le secret est trop court (`lib/auth.ts`, `proxy.ts`) |
| `PATISGEST_DEMO_SECRET` | app | — | oui | — | Signature du cookie de démo, ≥ 32 car. (`lib/actions-auth.ts`, `lib/auth.ts`, `lib/trial-crypto.ts`) |
| `PATSYGEST_EQUIPE_EXPERIMENTAL` | app | — | non | `false` | Invitations e-mail de l'équipe ; actives seulement en `development` **et** hors Vercel (`lib/equipe-experimental.ts`) |
| `PATSYGEST_TEST_INVITATION_EMAIL` | app + test | — | non | `false` | Redirige les invitations vers le serveur SMTP de test |

## 4. Notifications SMS & WhatsApp

| Variable | Portée | Obl. | Sensible | Défaut | Rôle / lecture |
|---|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | app | — | oui | — | Fournisseur option 1 (`lib/notifications-alerte.ts`) |
| `TWILIO_AUTH_TOKEN` | app | — | **oui** | — | Idem |
| `TWILIO_SMS_FROM` | app | — | non | — | Numéro expéditeur SMS |
| `TWILIO_WHATSAPP_FROM` | app | — | non | — | Expéditeur WhatsApp |
| `PATISGEST_SMS_WEBHOOK_URL` | app | — | oui | — | Fournisseur option 2 : webhook JSON `{ channel, to, message, meta }` |
| `PATISGEST_WHATSAPP_WEBHOOK_URL` | app | — | oui | — | Idem, canal WhatsApp |
| `PATISGEST_WEBHOOK_SECRET` | app + ci | — | **oui** | — | En-tête de signature partagé avec les webhooks |

## 5. Variables calculées par la plateforme — **ne jamais définir**

| Variable | Fournie par | Rôle |
|---|---|---|
| `NODE_ENV` | Next.js | `development` / `production` / `test` ; coupe le mode démo en prod |
| `VERCEL_ENV` | Vercel | `development` / `preview` / `production` ; source de vérité du garde-fou d'aperçu (`lib/preview-guard.ts`) |
| `PATISGEST_PREVIEW_BLOCKED` | `next.config.ts` | Drapeau figé au build à partir de `VERCEL_ENV` ; le définir à la main fausse le garde-fou |
| `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT` | `next.config.ts` | Dérivé de `PATISGEST_MODE_GRATUIT`, lu par `lib/licence-mode.ts` |
| `E2B_SANDBOX_ID` | plateforme d'agent | Autorise l'origine `3000-<id>.e2b.app` dans `allowedDevOrigins` |
| `PORT` | shell | Port du prototype `design-studio/serve.mjs` (défaut `4173`) |

## 6. Outillage local / hors application

| Variable | Portée | Obl. | Sensible | Défaut | Rôle |
|---|---|---|---|---|---|
| `DATABASE_URL` | outil | — | **oui** | — | Connexion directe PostgreSQL pour Drizzle (`db:studio` ; `db:push` est désactivé). Ni l'app ni Vercel n'en ont besoin |
| `PATSYGEST_BACKUP_PASSPHRASE` | outil + ci | — | **oui** | — | Phrase secrète (≥ 32 octets) du coffre chiffré `scripts/coffre-sauvegarde.mjs`. Nom historique avec « S » (S avant I), conservé |

## 7. Intégration continue — GitHub Actions

### Secrets (`Settings → Secrets and variables → Actions`)

| Nom | Sensible | Utilisé par | Rôle |
|---|---|---|---|
| `CRON_SECRET` | **oui** | `cron-connectivite.yml`, `observabilite-sondes.yml`, `certification-production.yml`, `ci.yml` (B.2) | Même valeur que dans Vercel |
| `SUPABASE_DB_URL` | **oui** | `sauvegarde-free.yml`, `certification-production.yml` | `pg_dump` chiffré ; doit utiliser `postgres.<project_ref>` sur le pooler |
| `BACKUP_PASSPHRASE` | **oui** | `sauvegarde-free.yml` | Alimente `PATSYGEST_BACKUP_PASSPHRASE` (≥ 32 car.) |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | non | workflows | Repli mutuel : `SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | non | workflows | Repli mutuel |
| `PATISGEST_ALERT_WEBHOOK_URL` | oui | `observabilite-sondes.yml` | Alerte d'incident ; repli `PATISGEST_WHATSAPP_WEBHOOK_URL` |
| `PATISGEST_WHATSAPP_WEBHOOK_URL` | oui | idem | Repli de l'alerte |
| `PATISGEST_WEBHOOK_SECRET` | **oui** | idem | Signature de l'alerte |
| `VERCEL_TOKEN` | **oui** | `rollback-chaud.yml` | Promotion d'un déploiement READY (rollback à chaud) |
| `R2_BUCKET` | non | `sauvegarde-free.yml` | Copie de sauvegarde hors GitHub (Cloudflare R2) |
| `R2_ACCOUNT_ID` | non | idem | Endpoint `https://<id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | **oui** | idem | Alimente `AWS_ACCESS_KEY_ID` |
| `R2_SECRET_ACCESS_KEY` | **oui** | idem | Alimente `AWS_SECRET_ACCESS_KEY` |

### Variables (`Settings → Variables`)

| Nom | Défaut du workflow | Rôle |
|---|---|---|
| `PATISGEST_APP_URL` | `https://patsy-gest.vercel.app` | Base des sondes et du cron |
| `VERCEL_PROJECT_ID` | `prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z` | Rollback à chaud |
| `VERCEL_TEAM_ID` | `team_Zs0MWAYqYN2fjolkybUsUqbK` | Rollback à chaud |

### Variables injectées par le runner / les steps

`GITHUB_STEP_SUMMARY` (résumé de job), `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION=auto`, `PASSPHRASE`, `FICHIER`,
`DB_URL` (alias internes des steps de sauvegarde), `NEXT_TELEMETRY_DISABLED=1`.

## 8. Tests, parcours E2E, certification et mesures

### Base de données réelle / pile jetable

| Variable | Portée | Rôle |
|---|---|---|
| `PATSYGEST_PG_URL` | test, ci | PostgreSQL réél des tests de concurrence, du seed E2E et du rejeu 01→57 (`postgres://postgres:ci-only@127.0.0.1:5432/postgres`) |
| `PATSYGEST_HOSTED_PG_URL` | test | Prioritaire dans `scripts/certification-concurrence-postgres.mjs` |
| `SUPABASE_DB_URL` | test | Repli de `PATSYGEST_HOSTED_PG_URL` |
| `DB_URL` | test | `tests/integration/restauration*.sh` (hôte local, port 54322 exigé) |
| `PATSYGEST_DISPOSABLE` | test, ci | `yes` autorise l'usage d'une base jetable |
| `PATSYGEST_TEST_VITRINE` | ci | `yes` active le schéma vitrine (`tests/integration/auth-postgrest.mjs`) |
| `PATISGEST_TEST_SAUVEGARDE` | test | Autorise le test du coffre de sauvegarde |
| `PATSYGEST_E2E_BASE` | test, ci | Base des parcours Playwright (`http://127.0.0.1:3416`) |
| `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` | test, ci | Produites par `supabase status -o env` |

### Chemins Chromium (parcours Playwright)

| Variable | Rôle |
|---|---|
| `PATISGEST_CHROMIUM_PATH` | Exécutable Chromium explicite |
| `PATISGEST_CHROMIUM_LIBS` | Préfixe `LD_LIBRARY_PATH` |
| `PATISGEST_CHROMIUM_FONTS` | Préfixe `FONTCONFIG_PATH` |
| `LD_LIBRARY_PATH`, `FONTCONFIG_PATH` | Variables système modifiées par `tests/e2e/helpers.mjs` |

### Ports des serveurs de test

| Variable | Défaut | Test |
|---|---|---|
| `SMOKE_PORT` | `3411` | `tests/smoke-http.mjs` |
| `PREVIEW_SMOKE_PORT` | — | `tests/preview-http.mjs` |
| `PREVIEW_SMOKE_BUILT` | — | Réutilise un build existant |
| `ROADMAP_HTTP_PORT` | — | `tests/roadmap-live-http.mjs` |
| `ROADMAP_E2E_PORT` | — | `tests/e2e/roadmap-vague4.spec.mjs` |

### Certification et observabilité

| Variable | Défaut | Rôle |
|---|---|---|
| `CERT_BASE_URL` | `https://patsy-gest.vercel.app` | Cible de `scripts/certification-production.mjs` |
| `CERT_EXPECTED_SCHEMA_VERSION` | `57` | Version de schéma attendue |
| `APP_URL` | — | Alias de base utilisé par les sondes et les workflows |
| `OBS_WARN_MS` | `3000` | Latence au-delà de laquelle un avertissement est émis |
| `OBS_SKIP_STACK` | — | Saute la sonde `/api/health/stack` |
| `OBS_WEBHOOK_URL`, `ALERTS_WEBHOOK_URL` | — | Noms historiques d'alerte (documentés dans `audit/`), non lus par le code actuel |

### Mesures B.2 — `scripts/audit-b2-reel.mjs`

| Variable | Défaut | Rôle |
|---|---|---|
| `B2_LOCAL_BASE` | — | Serveur local mesuré (`http://127.0.0.1:3419`) |
| `B2_PROD_BASE` | — | Production mesurée |
| `B2_DEMO_SECRET` | — | Secret du cookie de démo du serveur local |
| `B2_RUN_LOAD` | — | `1` active l'essai de charge |
| `B2_CONCURRENCY` | `5` | Concurrence de charge |
| `B2_HEALTH_REQUESTS` | `50` | Nombre de requêtes santé |
| `B2_PAGE_REQUESTS` | `20` | Nombre de requêtes de pages |
| `B2_SKIP_CHROMIUM` | — | `1` saute les mesures Chromium |
| `B2_STRICT_PROD` | — | `1` échoue si la production diverge |

### Outillage Supabase CLI (poste local)

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` —
authentification du CLI pour `supabase link`, `db push`, `migration` ; jamais lus
par l'application.

---

## Rappel de sécurité

1. `.env.local` et `.env*.local` sont ignorés par Git : ne jamais forcer l'ajout.
2. Ne jamais préfixer un secret par `NEXT_PUBLIC_` : la valeur partirait dans le
   bundle navigateur.
3. Les secrets de production vivent dans **Vercel → Settings → Environment
   Variables** (chiffrés) et dans **GitHub → Actions secrets** ; `CRON_SECRET`
   doit y être identique, sinon le cron et les sondes échouent en 401.
4. Le fichier `.env.example` reste la référence publique du dépôt ; ce document
   décrit l'inventaire complet, y compris les variables de CI et de test.
