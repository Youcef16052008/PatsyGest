# ARCHIVÉ — relevé historique 01→43 du 23 novembre 2026

> **Ne pas utiliser comme état courant.** La source de vérité est
> `migrations/repetition.json` (`historique` + `main_hors_serie`, 01→57) et le
> test actif `tests/chaine-rejouable.test.mjs`, qui applique réellement les
> 56 fichiers de schéma sur PGlite et atteint `app_schema_version = 57`.
> Le relevé ci-dessous documente une dérive constatée avant la mise à jour du
> manifeste ; il reste utile pour comprendre les adaptations Supabase explicites.

**Relevé le 23 novembre 2026.** Schéma vierge PGlite, `auth.*` et `creer_of` stubbés,
`pgcrypto` retiré (absent de PGlite, présent sur Supabase). Les 43 fichiers ont été
appliqués dans l'ordre, chacun dans sa transaction.

## Résultat

`43 fichiers, 4 échecs.`

| Fichier | Erreur | Nature |
|---|---|---|
| `02-seed-pilote.sql` | `relation "auth.users" does not exist` | **faux positif** — c'est un seed, il vise `auth.users` qui existe sur Supabase, pas dans un PGlite nu |
| `09-journaux-ecritures.sql` | `column "revision" of relation "clotures" does not exist` | **défaut réel** |
| `17-confidentialite-couts-rls.sql` | `function public.rls_auto_enable() does not exist` | **défaut réel** |
| `23-controle-modules.sql` | `Signature RPC ambiguë ou absente : creer_cake (0)` | **défaut réel** (en cascade depuis 09) |

Hors seed : **trois fichiers sur 42 ne se rejouent pas.**

## Défaut 1 — `clotures.revision` n'est jamais créée

`09-journaux-ecritures.sql` ligne 8 commence par :

```sql
ALTER TABLE public.clotures ALTER COLUMN revision SET DEFAULT 1;
```

Or `03-sprint2-modules.sql` (ligne 155) crée `clotures` **sans** colonne `revision` :
`id`, `client_id`, `site_id`, `date_cloture`, `lignes`, `created_at`. Aucune migration
n'ajoute la colonne. La base réelle l'a pourtant (vérifié : `revision integer not null
default 1`) — elle a donc été ajoutée à la main, ou par une version antérieure du
fichier qui n'a pas été enregistrée dans le dépôt.

Même fichier, le même problème sur `articles.pu_ht` (ligne ~156) : elle lit
`v_art.pu_ht`, or `articles` n'a que **12 colonnes**, dont `pv_ht` (prix de vente).
`pu_ht` n'existe pas. En base, la fonction `saisir_cloture` réellement installée
utilise bien `a.pv_ht` — le fichier du dépôt est donc **obsolète par rapport à ce qui
a été appliqué**.

Et `insert into public.clotures (…, agent_id)` : la colonne `agent_id` **n'existe sur
aucune table** de la base (`information_schema.columns` : 0 ligne). La fonction
réellement installée n'insère pas cette colonne.

## Défaut 2 — `rls_auto_enable()` est révoquée sans être créée

`17-confidentialite-couts-rls.sql` ligne 113 :

```sql
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
```

Aucune migration ne définit cette fonction. Elle existe en base (elle vient de
Supabase, c'est un utilitaire fourni par la plateforme), donc le `revoke` fonctionne
là-bas et échoue ici. **Ce n'est pas un bug à corriger** : c'est une dépendance
implicite à Supabase qu'il faut rendre explicite (`do $$ begin if exists (…) then
revoke … end if; end $$;`) pour que la chaîne soit rejouable ailleurs.

## Défaut 3 — `creer_cake` ambigu, mais pas comme le croyait la migration

La migration 23 exige qu'il existe **exactement une** fonction `creer_cake`
`security definer` :

```sql
if n <> 1 then raise exception 'Signature RPC ambiguë ou absente : % (%)',x.nom,n; end if;
```

Dans la chaîne reconstruite, il n'y en a **zéro** : la définition de `09` échoue sur
`pu_ht` avant d'atteindre `create function public.creer_cake`.

En base réelle, il y en a **une** (8 arguments, `security definer`) — la migration 23
y est donc passée. **Ce troisième échec est une cascade du premier, pas un défaut
indépendant.** Il disparaîtra quand `09` sera réparé.

## Ce que ça veut dire

La base pilote et le dépôt ont divergé. Le dépôt contient des fichiers de migration
qui **décrivent un état antérieur** aux corrections appliquées à la main sur la base
réelle : `clotures.revision`, `articles.pu_ht` → `pv_ht`, suppression d'`agent_id`,
garde `creer_cake`.

Conséquences concrètes :

1. **On ne peut pas recréer la base** à partir du dépôt, ni sur une nouvelle
   installation, ni pour une restauration après sinistre. C'est précisément ce que la
   répétition de la chaîne devait prouver.
2. **La restauration (écart B5) est encore moins prête qu'annoncé** : un dump restauré
   dans un schéma recréé depuis le dépôt n'aurait pas les mêmes colonnes.
3. **Les tests PGlite ne voient rien** : ils appliquent 09 en s'appuyant sur des
   stubs (`clotures.revision`, `creer_of`) et ne vérifient pas la rejouabilité de la
   chaîne complète.

## Ce que je n'ai pas fait

**Je n'ai pas réécrit les migrations.** Corriger `09` demande de savoir laquelle des
deux versions est la bonne — celle du fichier ou celle de la base. La base fait foi
(c'est elle qui tourne, c'est elle qui vend), donc c'est le fichier qu'il faut aligner
sur la fonction réelle. Mais :

- modifier une migration déjà appliquée et datée est une décision de gouvernance, pas
  un correctif technique ;
- le faire sans régénérer `migrations/repetition.json` (SHA-256 par fichier)
  casserait la traçabilité ;
- `09` porte `-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17)`,
  c'est un document historique.

**La bonne sortie** n'est pas de réécrire 09, mais d'ajouter une migration **44** qui
aligne la chaîne sur la réalité : `add column if not exists revision`,
`saisir_cloture` réinstallée depuis la version réelle de la base, `rls_auto_enable`
traitée conditionnellement. Plus la promotion des brouillons 101/115/116 (voir
`VUES-ROLES-ABSENTES.md`), qui est un autre trou de la même famille : des objets
utilisés par l'app et absents de la chaîne.

Autrement dit : **une migration 44 « alignement sur la base réelle »**, puis une
répétition 01→44 qui doit passer de bout en bout. Tant qu'elle ne passe pas, la
restauration n'est pas prouvée.

## Recommandation, dans l'ordre

1. Extraire de la base réelle les définitions exactes (`pg_get_functiondef`) de
   `saisir_cloture`, et les colonnes réelles de `clotures` / `articles`.
2. Écrire la migration 44 (alignement), sans toucher aux fichiers historiques.
3. Promouvoir 101/115/116 en migrations 45/46.
4. Rejouer 01→46 sur une base vierge, de bout en bout, avant toute restauration.
5. Ajouter ce rejeu à la suite de tests, dans un PGlite avec les `auth.*` stubs —
   c'est le seul contrôle qui attrape ce genre d'écart automatiquement.

## Ce que ce diagnostic a coûté

Une tentative de répétition. Il a évité de « prouver » une restauration sur une
chaîne qui ne s'applique pas, et il explique pourquoi la migration 23 signalait un
doute : elle avait raison plus tard, pour une autre raison.
