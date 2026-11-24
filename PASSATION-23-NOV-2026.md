# Passation — où en est le projet, 23 novembre 2026

Ce que ce fichier est : l'état réel, mesuré, à la fin de la session. Pas une feuille
de route, pas un souhait. Ce qui est écrit « fait » a été vérifié en base ; ce qui est
écrit « ouvert » n'a pas été fait.

## 1. Ce qui fonctionne maintenant

**Les trois comptes du pilote peuvent travailler.**

| Compte | Rôle | État |
|---|---|---|
| `amina@patisserie.dz` | propriétaire | tout, sans restriction |
| `sara@patisserie.dz` | labo | 8 modules opérationnels (17 articles, 13 lots, 3 gâteaux, 2 recettes, 1 BC, HACCP 3/3/1) |
| `amine@patisserie.dz` | vendeur | caisse opérationnelle, 17 articles, 6 lots, **aucun prix d'achat** |

Avant cette session : le labo avait **0** partout (écran vide, sans message) et le
vendeur lisait **13 lots sur 13** avec leur prix d'achat.

**Production** : `a107039` n'est plus le dernier déploiement. `1f7da8f` est en
production (déployé et vérifié), et deux commits depuis touchent le dépôt sans
re-déploiement nécessaire (documentation, messages).

## 2. Ce qui est appliqué en base (pilote `evepzygucfxarpdnflzv`)

`app_schema_version = 43`, plus **7 migrations appliquées hors série** :

| Migration | Objet |
|---|---|
| `104` | tables `equipe_*` + 9 fonctions (module inactif, voir §4) |
| `101` | 7 vues `labo_*`, 13 policies `labo_sans_finance`, 3 wrappers RPC |
| `105` | `patisgest_site_autorise()` + 10 policies `sites_attribues` |
| `112` | `patisgest_tous_sites_autorises()` + 5 policies `perimetre_indetermine` |
| `115` | vue `vendeur_lots` + fermeture de `lots.pu` au vendeur |
| `116` | vue `vendeur_ordres_fabrication` |
| `121` | `patisgest_site_autorise()` redéfinie : vendeur = boutique |

Plus le peuplement : Sara (labo) → 2 sites, Amine (vendeur) → boutique seule.

**11 vues en base** contre 1 avant.

## 3. Ce qui est ouvert, par ordre de gravité

### 3.1 La chaîne 01→43 ne se rejoue pas — 🔴 bloquant pour la restauration

`migrations/CHAINE-NON-REJOUABLE.md`. Trois fichiers référencent des objets
qu'aucune migration ne crée (`clotures.revision`, `articles.pu_ht → pv_ht`,
`rls_auto_enable()`). **On ne peut pas recréer la base depuis le dépôt**, donc la
restauration n'est pas seulement reportée : elle est impossible en l'état.

Sortie recommandée : migration 44 « alignement sur la réalité », en extrayant les
définitions de la base (`pg_get_functiondef`, `information_schema`).

### 3.2 Les migrations appliquées vivent encore dans `brouillons/` — 🟡

Elles tournent en base mais le dépôt ne le dit pas. Deux tests (`vues-roles-recette`)
restent en `todo` pour porter le signal. Décision de gouvernance : les déplacer dans
`supabase/` en 44–50, ou les laisser et corriger les tests.

### 3.3 Le module Équipe est inactif — 🟡 voulu

12 RPC `equipe_*` absentes (brouillons 110/113/114/118/119/120). Les tables et
fonctions de base existent (104), mais `equipeExperimentaleActive()` ferme tout
(`NODE_ENV=development`, pas de `VERCEL_ENV`, URL locale exacte). Aucun écran ne
casse. **Ne pas « réparer » sans valider le parcours complet.**

### 3.4 `password_min_length = 6` — 🟡 action manuelle

Hors de portée du connecteur (le réglage vit dans GoTrue). Console Supabase →
Authentication → Policies → **12** caractères + `lower_upper_letters_digits`.
Détail : `SECURITE-COMPTES.md`.

### 3.5 Le planning du labo reste limité — 🟡

`112` exige tous les sites pour les tables sans `site_id`. Sara a les deux sites,
donc l'HACCP passe. Mais l'écran n'indique pas encore cette limite à un utilisateur
qui n'aurait qu'un site. Message déjà en place, à affiner si un 4e compte arrive.

## 4. Ce qui n'a jamais été exécuté

| Élément | Pourquoi |
|---|---|
| Restauration (B5) | décision : reportée à 15 clients, puis option payante. Bloquée de fait par §3.1 |
| Impression réelle du ticket 80 mm | aucun ticket imprimé, protocole écrit |
| 3 novices sur le parcours | aucune personne extérieure n'a utilisé le logiciel |
| DPA signée | région vérifiée (`eu-west-1`, UE), document non signé |
| Test HTTP complet | mesures faites en SQL direct avec les claims JWT, pas via PostgREST |

## 5. Vérifications de fin de session

```
npm test    572 réussis / 0 échec / 3 ignorés / 6 todo
npx tsc     0 erreur
npm run lint 0 erreur
```

Le `6 todo` est délibéré : 2 tests signalent que les migrations vivent encore dans
`brouillons/`, 1 que la chaîne 01→43 ne se rejoue pas, 3 sont anciens.

## 6. Si quelqu'un reprend

Lire dans cet ordre :

1. `migrations/VALIDATION-CONFIDENTIALITE-ROLES.md` — ce qui a été appliqué et mesuré.
2. `migrations/CHAINE-NON-REJOUABLE.md` — le prochain vrai chantier.
3. `AUDIT-CONFORMITE-CDC-CODE.md` §0 bis — l'état par écart, à jour.
4. `migrations/VUES-ROLES-ABSENTES.md` — le diagnostic initial, conservé comme trace
   (dont l'erreur de diagnostic que le §5 corrige).

La règle qui a émergé deux fois dans cette session : **un test qui monte son propre
schéma ne prouve rien sur le schéma installé**. Vérifier en base, pas dans PGlite.
