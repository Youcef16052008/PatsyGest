# PASSATION AGENT — PâtisGest, 23 novembre 2026

**Destinataire :** l'agent qui reprend. Ce document est opérationnel, pas narratif.
Il dit ce qui est fait, ce qui reste, et **par quel outil** le faire. Là où un outil
manque, c'est écrit — ne cherche pas une voie qui n'existe pas.

**Dépôt :** `Youcef16052008/PatsyGest` · **Branche de travail :** `arena/84a9c7a5-patsygest`
**HEAD au moment d'écrire :** `20ffd0f` · **Base pilote :** `evepzygucfxarpdnflzv` (v43)
**Production :** `https://patsy-gest-all-intelligence.vercel.app`

---

## 0. À lire avant de toucher quoi que ce soit

Trois règles apprises à la dure dans la session précédente. Les enfreindre coûte cher.

**R1 — Un test qui monte son propre schéma ne prouve rien sur le schéma installé.**
`tests/labo-confidentialite-db.test.mjs` applique le brouillon 101 lui-même. Il était
vert pendant que les vues étaient absentes de la base et que deux comptes réels ne
pouvaient pas travailler. Vérifie **en base**, pas dans PGlite.

**R2 — Un RPC appelé et absent n'est pas un défaut tant qu'on n'a pas cherché le
chemin d'exécution.** Neuf `equipe_*` manquaient ; `equipeExperimentaleActive()` fermait
toutes les portes. « Réparer » aurait été le vrai dégât.

**R3 — Le sandbox re-clone et réinitialise l'historique local.** Au début de cette
session, `git status` montrait HEAD à `dfd8235` alors que le distant était à `20ffd0f`.
Avant de commiter : `git fetch origin arena/84a9c7a5-patsygest` puis
`git reset --hard origin/arena/84a9c7a5-patsygest`. `node_modules` disparaît aussi :
`cd patisgest-app && npm install` avant tout test.

---

## 1. État vérifié — ne pas refaire

### 1.1 Base (`evepzygucfxarpdnflzv`)

| Métrique | Valeur mesurée |
|---|---|
| `app_schema_version` | **43** |
| Vues `public` | **10** (7 `labo_*` + 2 `vendeur_*` + `vitrine_catalogue`) |
| Policies `public` | **111** |
| `equipe_sites` | 3 lignes (Sara→2 sites, Amine→boutique) |

**7 migrations appliquées hors série**, dans cet ordre (l'ordre compte) :
`104` → `101` → `105` → `112` → `115` → `116` → `121`.
Elles vivent encore dans `supabase/brouillons/`. Détail :
`patisgest-app/migrations/VALIDATION-CONFIDENTIALITE-ROLES.md`.

**Mesures de non-régression à ne pas casser** (rejouables par `execute_query`) :

| Compte | Attendu |
|---|---|
| vendeur | `lots.pu` = **0**, `vendeur_lots` = 6, articles = 17, site boutique `true`, site labo `false` |
| labo | `labo_articles` = 17, `labo_lots` = 13, `articles` brut = **0**, HACCP 3/3/1, `tous_sites` = `true` |
| propriétaire | `pu` = 13, `sites` = 2, `cakes` = 3, `ventes` = 8 |

Requête type pour rejouer un profil :

```sql
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub',(select auth_user_id::text from public.utilisateurs where role='vendeur' limit 1),
  'role','authenticated')::text, true);
select set_config('role','authenticated',true);
-- … requêtes de mesure …
rollback;
```

⚠️ L'ordre des deux `set_config` est **obligatoire** : claims d'abord, `role` ensuite.
Sinon `auth.uid()` renvoie `null` et tout lit 0 — j'ai perdu du temps là-dessus.

### 1.2 Authentification

`jwt_exp` = 43200 ✅ · `disable_signup` = true ✅ · rotation = true ✅
`password_min_length` = **6** ❌ · `password_required_characters` = **null** ❌

### 1.3 Code

```
npm test     572 réussis / 0 échec / 3 ignorés / 6 todo
npx tsc      0 erreur
npm run lint 0 erreur
```

Les 6 `todo` sont **délibérés** : ce sont des signaux, pas des oublis.

---

## 2. Ce qui reste — par ordre, avec l'outil exact

### P1 — 🔴 La chaîne 01→43 ne se rejoue pas

**Impact :** on ne peut pas recréer la base depuis le dépôt. La restauration (US-15.2)
n'est donc pas seulement reportée, elle est **impossible en l'état**.

**Connu :** `migrations/CHAINE-NON-REJOUABLE.md`. Trois défauts :
- `09` fait `alter column clotures.revision` — colonne qu'aucune migration ne crée.
- `09` lit `articles.pu_ht` — la colonne est `pv_ht`.
- `17` révoque `rls_auto_enable()` — aucune migration ne la crée (elle vient de Supabase).

**Ce que tu PEUX faire (connecteur Supabase) :** extraire la vérité de la base.

```sql
-- 1. la définition réelle
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='saisir_cloture';
-- 2. les colonnes réelles
select table_name, column_name, data_type, column_default from information_schema.columns
 where table_schema='public' and table_name in ('clotures','articles') order by table_name, ordinal_position;
```

Puis écrire `supabase/44-alignement-reel.sql` **sans modifier 09** (c'est une pièce
datée), et rejouer la chaîne. Le test `tests/chaine-rejouable.test.mjs` (marqué `todo`)
donne le critère d'acceptation : il doit passer.

**Piège :** `migrations/repetition.json` contient un SHA-256 par fichier. Toute
migration ajoutée doit être enregistrée à trois endroits : le fichier,
`repetition.json`, et la liste attendue dans `tests/migrations-repetition.test.mjs`.

### P2 — 🟡 Les migrations appliquées vivent encore dans `brouillons/`

Décision de gouvernance **à demander au propriétaire**, ne la prends pas seul :
les déplacer en `supabase/44..50` + mettre à jour `repetition.json` et les deux tests
`vues-roles-recette.test.mjs`, ou les laisser et documenter.

### P3 — 🟡 `password_min_length = 12`

**Vérifié hors de portée programmatique.** `auth.instances` ne porte plus la politique ;
`update_auth_config` du connecteur n'expose ni `password_min_length` ni
`password_required_characters`. **Action manuelle du propriétaire** :
console Supabase → Authentication → Policies → 12 + `lower_upper_letters_digits`.
Ne cherche pas de contournement : il n'y en a pas depuis cet environnement.

### P4 — 🟡 Le module Équipe est inactif — voulu

12 RPC `equipe_*` absentes (brouillons 110/113/114/118/119/120). Tables et 9 fonctions
de base existent (`104`). `equipeExperimentaleActive()` ferme tout. **Ne pas activer
sans valider le parcours complet des invitations.** Détail :
`migrations/EQUIPE-MODULE-INACTIF.md`.

### P5 — 🟡 Items physiques (protocole écrit, jamais exécuté)

`PROTOCOLE-QUALIFICATION-MATERIELLE.md` :
- impression réelle d'un ticket 80 mm (7 tests verts, **aucun ticket imprimé**) ;
- 3 novices sur le parcours ≤ 3 clics ;
- DPA signée (région `eu-west-1` ✅ UE, document ❌ non signé).

Un agent ne peut pas faire ces trois-là. **Le dire au propriétaire, ne pas le simuler.**

### P6 — 🔴 Écart produit à ne pas oublier

`112` exige **tous les sites** pour les tables sans `site_id` (HACCP, planning, achats).
Sara a les deux sites, donc ça passe. **Mais un 4e compte labo sur un seul site perdrait
tout le module HACCP** — mesuré. Si un nouveau client arrive, retester ce point avant
de l'ouvrir.

---

## 3. Ce que les connecteurs permettent réellement

| Besoin | Outil | Limite |
|---|---|---|
| Lire/écrire la base pilote | `supabase.execute_query` | Renvoie **seulement le dernier result set** (suffixe `create temp table res on commit drop` + `select * from res`). Rejette **tout le batch** à la première erreur. |
| Appliquer une migration | `supabase.create_migration` | Rollback auto en cas d'échec. Préférable à `execute_query` pour du DDL — mais **non testé ici**. |
| Dépôt Git | `bash` + `git`, `gh` | Auth configurée. `gh pr create` marche. |
| Déployer | `vercel.create_deployment` | **Les push ne déploient pas.** Cibler `prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z`, team `team_Zs0MWAYqYN2fjolkybUsUqbK`, `target: production`, `git_source.ref` = la branche. |
| Vérifier un déploiement | `vercel.get_deployment` | Attendre `ready_state: READY` + `aliasAssigned: true`. ~4 min. |
| Config auth | `supabase.get_auth_config` / `update_auth_config` | Lecture large ; écriture **limitée** (jwt_exp, disable_signup, rotation, site_url). Pas la politique de mot de passe. |
| Tester le site | `fetch_page` | **`curl` échoue** : l'egress du sandbox bloque le TLS vers Vercel. Utilise `fetch_page`. |

**Ne perds pas de temps sur :** appliquer un `GRANT` par SQL quand l'objet est créé
dans la même transaction (les nouveaux objets héritent des privilèges par défaut) —
mais vérifie toujours après coup avec `has_table_privilege`.

---

## 4. Commandes de démarrage

```bash
cd /home/user/PatsyGest
git fetch origin arena/84a9c7a5-patsygest && git reset --hard origin/arena/84a9c7a5-patsygest
cd patisgest-app && npm install          # node_modules ne survit pas au sandbox

# un test ciblé (~15 s)
node --experimental-strip-types --experimental-test-module-mocks \
  --import ./tests/mocks/register-hooks.mjs --test tests/confidentialite-roles-db.test.mjs

# la suite complète (~4 min)
npm test
```

---

## 5. Où est la vérité, fichier par fichier

| Fichier | Ce qu'il contient |
|---|---|
| `AUDIT-CONFORMITE-CDC-CODE.md` | état par écart, §0 bis à jour (A→I) |
| `PASSATION-23-NOV-2026.md` | version courte, grand public |
| `patisgest-app/migrations/VALIDATION-CONFIDENTIALITE-ROLES.md` | ce qui a été appliqué + **mesures avant/après** |
| `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` | **le prochain chantier (P1)** |
| `patisgest-app/migrations/VUES-ROLES-ABSENTES.md` | diagnostic initial, conservé comme trace (contient une erreur de diagnostic, corrigée au §5) |
| `patisgest-app/migrations/EQUIPE-MODULE-INACTIF.md` | pourquoi Équipe reste fermé |
| `patisgest-app/SECURITE-COMPTES.md` | politique de mot de passe, journal des vérifications |
| `PROTOCOLE-QUALIFICATION-MATERIELLE.md` | les 3 items physiques |
| `patisgest-app/tests/confidentialite-roles-db.test.mjs` | **le test qui verrouille la fuite des prix d'achat** |

---

## 6. La phrase à retenir

Cette session a appliqué sept migrations de sécurité et réparé deux comptes réels, mais
elle a surtout montré que **la suite verte ne prouvait pas la production**. Avant de
déclarer quoi que ce soit terminé : ouvre la base, prends l'identité du compte concerné,
et mesure. Le reste, c'est de la littérature.
