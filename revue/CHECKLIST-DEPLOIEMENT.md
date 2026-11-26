# Checklist de déploiement du pilote

> **Portée :** mise en ligne de `patisgest-app/` chez **un** pilote, plus application
> de la migration `53`. Ce document ne couvre pas une ouverture commerciale générale.
>
> **Statut :** prête, **non exécutée**. Les cases sont à cocher dans l'ordre.

Vocabulaire : « la base du pilote » = le projet Supabase utilisé par le pilote
(référence `SUPABASE_URL`), distinct de tout projet de test.

---

## 1. Pré-déploiement (sur la machine de livraison)

Toutes les commandes partent de `patisgest-app/`.

| # | Contrôle | Commande / action | Attendu |
|---|---|---|---|
| 1.1 | Node conforme | `node -v` | **≥ 22.15.0** (`engines.node`) |
| 1.2 | Dépendances verrouillées | `npm ci` | exit 0, aucun avertissement bloquant |
| 1.3 | Types | `npm run typecheck` | exit 0, aucune sortie |
| 1.4 | Lint | `npm run lint` | exit 0, aucune sortie |
| 1.5 | Suite complète | `npm test` | `fail 0` |
| 1.6 | Build de production | `npm run build` | exit 0, routes `ƒ` attendues |
| 1.7 | Chaîne de migrations rejouable | incluse dans 1.5 (`chaine-rejouable`, `migrations-repetition`, `schema-complet`, `caisse-collision-db`) | 4 tests verts |
| 1.8 | Version de branche | `git status --short`, `git log -1` | arbre propre, commit attendu |
| 1.9 | Variables d'environnement | comparer le tableau de production à `patisgest-app/.env.example` | toutes les variables de la section « Production » renseignées |

### 1.9 — Variables à définir en production

Obligatoires :

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — serveur uniquement, jamais dans le bundle client
- `PATISGEST_MASTER_EMAIL`, `PATISGEST_MASTER_KEY` — accès `/master`
- `CRON_SECRET` — jeton Bearer de `/api/cron/connectivite`

Recommandées :

- `VITRINE_SECRET_ANTI_ABUS` — ≥ 32 caractères ; **sert aussi de graine de repli**
  pour la signature des licences si `PATISGEST_MASTER_KEY` manque
  (`src/lib/trial-crypto.ts:26-34`)
- `PATISGEST_DOMAINE` — domaine racine des vitrines (défaut `patisgest.dz`)
- `PATISGEST_MASTER_PHONE`, `PATISGEST_OFFLINE_ALERT_MINUTES` — alertes de coupure
- `PATISGEST_LICENSE_PRIVATE_JWK` **ou** `PATISGEST_LICENSE_PRIVATE_KEY` — signature
  des jetons de licence

À **ne pas** définir à la main : `NODE_ENV`, `VERCEL_ENV`, `PATISGEST_PREVIEW_BLOCKED`
(calculées par Next.js / Vercel / `next.config.ts`). `PATISGEST_DEMO_MODE` doit
valoir `false` ou être absente en production : le mode démo est de toute façon
désactivé hors `NODE_ENV=development` (`src/lib/auth.ts:60`).

- [ ] Toutes les variables du bloc obligatoire sont présentes
- [ ] Aucune valeur de démonstration (`change-me`, `remplacer-par…`) ne subsiste

---

## 2. Migration 53 — application manuelle (précédée de la 52 de `main`)

### 2.0 Vérifier d'abord la 52 de `main` (mesuré le 2026-11-26 : elle manque)

> **Constat, pas hypothèse.** Interrogé avant toute écriture, le pilote
> `evepzygucfxarpdnflzv` répond `app_schema_version = 51`. La migration
> `52-recettes-photos.sql` (PR #23) **n'y a jamais été appliquée**. Elle est
> additive (`add column if not exists`, contrainte recréée sous
> `drop constraint if exists`) et c'est elle qui écrit la version 52 : sans
> elle, la 53 passerait la version de 51 à 53 en sautant un cran, et la
> contrainte `recettes_libres_photo_url_check` manquerait.

```sql
select version from public.app_schema_version where id = 1;
```

- **51** → appliquer d'abord `patisgest-app/supabase/52-recettes-photos.sql`,
  puis contrôler `= 52`, puis seulement la 53 ci-dessous.
- **52** → appliquer directement la 53.
- **53** → rien à faire, la migration est déjà passée : arrêter.

- [ ] Version de départ mesurée et notée dans le journal (§6)
- [ ] Si 51 : `52-recettes-photos.sql` appliquée **avant** la 53


> **Pourquoi manuelle :** `patisgest-app/supabase/53-caisse-ticket-scope.sql` n'est pas dans la chaîne
> automatique de déploiement (`migrations/repetition.json`, entrée `main_hors_serie`
> avec `hors_fixture_pilote: true`). Elle doit être appliquée explicitement.
>
> **Nature :** un seul `create or replace function public.vendre_panier(...)`
> (ligne 38) + montée de `app_schema_version` à `53` (lignes 287-291).
> **Aucun `DROP`, aucune perte de données, aucun DDL destructif.**

### 2.1 Avant (relever l'état)

```sql
select version from public.app_schema_version where id = 1;
-- Attendu : 51, ou 52 si la 52 de `main` est déjà passée (voir 2.0).
-- Si 53 est déjà là, la migration a déjà été appliquée : arrêter.
```

- [ ] `app_schema_version` lue et notée (valeur : `______`)

### 2.2 Pendant (ordre exact)

1. **Fenêtre d'arrêt des ventes** — prévenir le pilote : aucune vente caisse
   pendant l'opération. La fonction remplacée est celle du chemin de vente.
2. Sauvegarder au minimum le corps actuel de la fonction (copie de secours) :
   ```sql
   select pg_get_functiondef('public.vendre_panier(uuid, jsonb, text, text)'::regprocedure);
   ```
   Copier la sortie dans un fichier horodaté, hors du dépôt.

   > `::regproc` accepte aussi un nom nu, mais `::regprocedure` accompagne la
   > signature : si `vendre_panier` était un jour surchargée, `regproc`
   > échouerait (« more than one function named… ») là où `regprocedure` reste
   > sans ambiguïté. Les deux formes ont été vérifiées. En revanche
   > `'public.vendre_panier'::regprocedure` **échoue** (« expected a left
   > parenthesis ») : la signature est obligatoire avec ce cast.
3. Exécuter le contenu de `patisgest-app/supabase/53-caisse-ticket-scope.sql`
   dans l'éditeur SQL Supabase.

   > **Le fichier porte DÉJÀ sa transaction** : `begin;` en ligne 36 et
   > `commit;` en ligne 293 (dernière ligne). **Ne l'enveloppez pas** dans un
   > second `begin; … commit;`.
   >
   > Référence — documentation PostgreSQL, `BEGIN` : « Issuing `BEGIN` when
   > already inside a transaction block will provoke a warning message. The
   > state of the transaction is not affected. » Le `BEGIN` interne est donc
   > purement ignoré, **mais le `COMMIT` interne, lui, valide la transaction
   > externe** : l'écriture est déjà durable avant que votre `COMMIT` final
   > n'arrive. On croit avoir un « tout ou rien » qu'on n'a pas.
   >
   > Collez le fichier seul, puis vérifiez le résultat au § 2.3.

   En cas d'erreur signalée par l'éditeur : le `begin;` du fichier n'a pas été
   suivi de son `commit;`, la transaction reste ouverte et sera annulée à la
   fermeture de session. Exécuter `rollback;` explicitement, puis **ne pas
   relancer à l'aveugle** : lire le message d'abord.

- [ ] Copie de secours du corps de `vendre_panier` enregistrée
- [ ] Migration exécutée et `commit` effectué

### 2.3 Après (vérification obligatoire)

```sql
-- a) Version montée
select version from public.app_schema_version where id = 1;
-- Attendu : 53

-- b) La fonction installée est bien celle de 53.
--    On cherche des marqueurs ABSENTS des versions 21→50. Une simple présence
--    de « site_id » ne prouverait rien : cette colonne existe depuis la 21.
select
  (prosrc like '%Ticket deja utilise pour une autre vente.%') as leve_sur_conflit,
  (prosrc like '%jsonb_array_length(p_lignes)%')              as controle_taille,
  (prosecdef or prosrc like '%security definer%')             as security_definer,
  (proconfig::text like '%search_path%')                      as search_path_pinne
from pg_proc
where proname = 'vendre_panier' and pronamespace = 'public'::regnamespace;
-- Attendu : 4 × true

-- c) Aucune fonction en double (surcharge accidentelle)
select count(*) from pg_proc
where proname = 'vendre_panier' and pronamespace = 'public'::regnamespace;
-- Attendu : 1
```

- [ ] Version = `53`
- [ ] Les quatre drapeaux de 2.3-b valent `true`
- [ ] Une seule signature de `vendre_panier`

> Si 2.3-a vaut 53 alors que 2.3-b est faux : la version a été incrémentée mais
> le corps n'a pas été remplacé (mauvaise base, script partiellement exécuté).
> Ne pas réessayer à l'aveugle — restaurer la copie de 2.2-2 puis rouvrir
> l'incident.

---

## 3. Déploiement

- [ ] Fusionner le commit validé en 1.8 sur la branche déployée
- [ ] Laisser le build de la plateforme (Vercel) terminer en succès
- [ ] Vérifier que **`VERCEL_ENV=production`** : en `preview`, le garde-fou
      `previewBloquee` renvoie 503 sur toutes les routes métier
      (`src/lib/preview-guard.ts:6-24`)
- [ ] Vérifier qu'aucun aperçu de préproduction ne pointe sur la base du pilote

---

## 4. Post-déploiement

### 4.1 Sonde applicative

```bash
curl -sS https://<domaine>/api/health
```

- [ ] Réponse `200` avec `{"ok":true,"service":"patisgest","ts":"…"}`
- [ ] En-tête `Cache-Control: no-store` présent

> Cette sonde ne teste **pas** la base, volontairement (`src/app/api/health/route.ts`).
> Un 200 prouve que le processus répond — rien de plus. Les contrôles ci-dessous
> couvrent le reste.

### 4.2 Parcours de fumée (navigateur, compte propriétaire du pilote)

| # | Parcours | Attendu |
|---|---|---|
| 4.2.1 | `/connexion` puis tableau de bord | connexion acceptée, pas de boucle de redirection |
| 4.2.2 | Vente caisse simple, ticket neuf | vente enregistrée, stock déduit une fois |
| 4.2.3 | **Rejouer la même requête de vente** (même ticket, même contenu) | réponse idempotente, **aucune** double déduction de stock |
| 4.2.4 | Vente avec le **même numéro de ticket mais un contenu différent** | refus « Ticket deja utilise pour une autre vente. » |
| 4.2.5 | Clôture de caisse : comptage tiroir puis validation | clôture enregistrée, écart calculé |
| 4.2.6 | Export comptable (CSV) | fichier téléchargé, totaux cohérents avec 4.2.2 |
| 4.2.7 | Espace `/master` | accessible avec les identifiants Master, refusé sans |
| 4.2.8 | Vitrine publique `/<slug>` | s'affiche ; action inconnue ne provoque **aucune** erreur 500 |

- [ ] Les 8 parcours sont conformes

### 4.3 Cron de connectivité

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/connectivite
```

- [ ] Réponse **HTTP 200** contenant `ok: true`
- [ ] Sans en-tête `Authorization` : **401** `{"erreur":"Non autorisé."}`
- [ ] Si la réponse est **503**, lire le champ `error` : la sonde renvoie 503
      (`src/app/api/cron/connectivite/route.ts:30`) quand la lecture des
      utilisateurs échoue ou qu'aucune ligne n'est exploitable — ne pas le
      confondre avec une panne réseau

### 4.4 Storage Supabase

**Constat à re-vérifier, pas une procédure d'installation** : l'application
n'effectue **aucun envoi** vers Supabase Storage (aucun bucket créé, aucune
colonne photo sur `articles`, voir `NOTE-HEBERGEMENT.md:45`).

```sql
-- Buckets et objets : attendu (0, 0) au pilote
select (select count(*) from storage.buckets) as buckets,
       (select count(*) from storage.objects) as objets;
```

- [ ] `buckets = 0` et `objets = 0`

> Si un bucket ou des objets apparaissent : un composant non prévu écrit dans
> Storage. **Ne pas** configurer de limite MIME ni de taille « au cas où » —
> identifier d'abord l'origine. Les fichiers SVG servis par l'application sont
> des `data:` URI générés en mémoire (`src/lib/pastry-visuals.ts:59-60`), ils ne
> transitent pas par Storage.

---

## 5. Retour arrière

Trois niveaux, du moins invasif au plus.

### 5.1 Revenir sur le code (sans toucher à la base)

- [ ] Redéployer le commit précédent depuis la plateforme
- La migration 53 reste appliquée. C'est **sans danger** : l'ancien code de vente
  appelle la même signature `public.vendre_panier(...)` ; seul son corps change.

### 5.2 Revenir sur la fonction `vendre_panier`

- [ ] Recoller la sortie de `pg_get_functiondef` enregistrée en 2.2-2
- [ ] Remettre la version : `update public.app_schema_version set version = 51 where id = 1;`
- [ ] Rejouer 2.3-b pour confirmer le retour

> La portée du ticket redevient celle de la migration 21→50 : un rejeu sur un autre
> site peut rendre la vente de l'autre site. À ne faire qu'en connaissance de cause,
> et rouvrir l'incident.

### 5.3 Restauration complète de la base

- [ ] Suivre `revue/PROCEDURE-RESTAURATION-PILOTE.md`
- [ ] Rappel : cette procédure est **prête mais non exécutée** ; la restauration du
      pilote n'est **pas** certifiée par le dépôt

---

## 4 bis. Audit des variables Vercel — mesuré le 2026-11-26, **bloquant**

Projet `patsy-gest` (`prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z`), équipe
`team_Zs0MWAYqYN2fjolkybUsUqbK`, racine `patisgest-app`.

`list_env_vars` renvoie **six** variables, et **aucune** des quatre requises
n'est présente :

| Variable | Exigence | État mesuré |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | doit exister | **ABSENTE** |
| `PATISGEST_MASTER_KEY` | doit exister | **ABSENTE** |
| `CRON_SECRET` | doit exister | **ABSENTE** |
| `VITRINE_SECRET_ANTI_ABUS` | ≥ 32 caractères | présente, `sensitive`, **valeur vide** |
| `VERCEL_ENV` | doit être absente | absente ✔ |
| `PATISGEST_PREVIEW_BLOCKED` | doit être absente | absente ✔ |
| `PATISGEST_DEMO_MODE` | doit être absente | absente ✔ |

Seules existent : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(production + preview), plus les trois lignes du tableau ci-dessus.

**Conséquence à décider avant de déployer.** La migration 53 se pose sans ces
variables, mais l'application déployée s'en sert à l'exécution :

- `SUPABASE_SERVICE_ROLE_KEY` — `/master` et `/api/cron/connectivite` ;
- `PATISGEST_MASTER_KEY` — chiffrement de l'espace Master ;
- `CRON_SECRET` — authentification des routes cron ;
- `VITRINE_SECRET_ANTI_ABUS` vide — l'anti-abus vitrine retombe sur le plafond
  global de la base, ce qui est le comportement de repli documenté, donc non
  bloquant, mais **la protection par source est absente**.

**Je n'écris aucune de ces valeurs** : un secret ne se fabrique pas à ma place
et ne transite pas par la conversation. Elles sont à saisir par le propriétaire
dans Vercel → Settings → Environment Variables (Production), avant le
déploiement si l'on veut `/master` et le cron fonctionnels dès la mise en ligne.

---

## 5 bis. Note de rebasage (à lire avant tout bisect)

Les 11 commits de cette branche ont été rebasés sur `main` après PR #23, qui a
pris le numéro de migration **52**. Deux points utiles si un `git bisect` passe
un jour par ici :

1. **La migration est `53-caisse-ticket-scope.sql`** (empreinte
   `eb53b6915c8743c77f36a3b47813c335a4ff167ba950748bbaf3ffdda4604658`).
   `52-recettes-photos.sql` appartient à `main` et **ne doit pas être rejouée**
   sur le pilote si PR #23 l'y a déjà appliquée.
2. **Les commits intermédiaires ne typent pas seuls.** `tsc` échoue sur le
   commit « refactor(permissions) » (appels `getSessionContext({ allowLocked })`
   avant que l'option n'existe, ajoutée au commit « feat(essai) »), et sur les
   deux suivants (`client-logout.tsx` / `deconnexion-locale.ts` importés avant
   leur ajout par « feat: finitions pilote »). **C'est antérieur au rebasage et
   sans effet sur `main` ni sur la tête de branche** : seuls la CI de la branche
   et le commit final comptent. Ne pas « corriger » ces commits en les
   réécrivant, le découpage est volontaire.

---

## 6. Journal de l'intervention

| Élément | Valeur |
|---|---|
| Date / heure | |
| Commit déployé | |
| Version `app_schema_version` avant → après | |
| `/api/health` | |
| Parcours 4.2 conformes (1-8) | |
| `buckets` / `objets` | |
| Incident pendant l'opération | |
| Décision finale (poursuite / retour arrière) | |
| Opérateur | |
