# Module Équipe — pourquoi il n'est pas en production, et pourquoi ce n'est pas un bug

**Date :** 23 novembre 2026 · **Statut : vérifié, conforme, volontairement inactif**

## L'alerte, et pourquoi elle était fausse

En comparant les appels `rpc(...)` du code aux fonctions réellement présentes dans la
base pilote, j'ai trouvé neuf fonctions appelées par l'application et **absentes de la
base** :

```
equipe_annuler_approbation      equipe_inviter
equipe_annuler_invitation       equipe_lister_invitations
equipe_approuver_demande        equipe_modifier_affectations_versionnees
equipe_code                     equipe_refuser_demande
equipe_revoquer_versionne
```

Neuf actions « Équipe » qui échoueraient en production. L'alerte semblait grave : un
module visible, inutilisable.

**Elle était fausse**, et l'inspection du garde-fou l'explique en dix lignes.

## Le garde-fou

`src/lib/equipe-experimental.ts` :

```ts
export function equipeExperimentaleActive(env = process.env): boolean {
  if (env.NODE_ENV !== "development" || env.VERCEL_ENV ||
      env.PATSYGEST_EQUIPE_EXPERIMENTAL !== "true") return false;
  // … puis : http://127.0.0.1:54321 exactement, rien d'autre
}
```

Trois conditions cumulatives, et la deuxième est décisive : **la présence de
`VERCEL_ENV` suffit à désactiver le module**. Cette variable est toujours définie sur
Vercel, donc le module est structurellement inactif en production et en préversion,
quelles que soient les autres variables d'environnement.

Il est appliqué à **tous** les points d'entrée, sans exception :

| Point d'entrée | Garde |
|---|---|
| `actions-equipe.ts` (les 8 actions) | `if (!equipeExperimentaleActive()) return null` |
| `actions-rejoindre.ts` | idem |
| `app/(auth)/rejoindre/page.tsx` | `notFound()` |
| `parametres/page.tsx` — lecture des RPC | `if (equipeExperimentale && …)` |
| `parametres/page.tsx` — affichage du panneau | `equipeExperimentale && <EquipeSettings …>` |
| `invitation-mail.ts` | renvoie `non_configuree` |

Une action gardée qui renvoie `null` **et** une interface qui n'est pas rendue : il n'y
a pas de chemin par lequel un utilisateur de production puisse atteindre ces neuf
fonctions. Ce n'est pas « ça échoue silencieusement », c'est « ça n'existe pas ».

## Pourquoi les migrations sont restées en brouillon

Les sept migrations `equipe-*` vivent dans `supabase/brouillons/` (104, 110, 113, 114,
118, 119, 120) et portent un avertissement explicite : *« aucun accès métier n'est
accordé tant que l'isolation par site des tables, vues et RPC n'est pas achevée. Aucun
changement sur le pilote. »*

J'ai lu leur contenu : RLS activée sur les quatre tables, `revoke all` puis `grant
execute` ciblé, fonctions `security definer` avec contrôle du rôle. Ce n'est pas du
brouillon bâclé. Mais **l'avertissement n'est pas levé**, et c'est cette condition —
l'isolation par site achevée — qui décide de la mise en service, pas la qualité
apparente du SQL.

## Un vrai défaut trouvé en écrivant le test

Le garde reposait sur une vérité d'absence : `if (… || env.VERCEL_ENV || …)`. Un test
d'écriture a montré que **`VERCEL_ENV: ''` active le module** — chaîne vide, donc
falsy. « La variable est définie et vide » n'est pas « la variable est absente », et en
JavaScript une comparaison de véracité confond les deux.

Sur Vercel la variable est toujours non vide, donc l'exposition était improbable. Mais
un `VERCEL_ENV=''` propagé accidentellement (déploiement manuel, variable vidée en
console) aurait suffi à ouvrir le module en dehors du local — précisément le chemin
que ce garde existe pour fermer.

Corrigé en testant la **présence de la clé** et non sa valeur :

```ts
const surVercel = "VERCEL_ENV" in env && env.VERCEL_ENV !== undefined;
```

Vérifié sur quatre cas réels :

| Contexte | Résultat |
|---|---|
| `NODE_ENV=production`, `VERCEL_ENV=production` | `false` ✅ |
| `VERCEL_ENV` défini mais vide | `false` ✅ (c'était `true` avant) |
| local `127.0.0.1:54321` tout activé | `true` ✅ (le mode local marche toujours) |
| local mais URL Supabase distante | `false` ✅ |

C'est le genre de défaut qui ne se voit qu'en cherchant à écrire le test qui doit
échouer. Trois lignes de code, et un module de gestion des accès qui ne s'ouvre plus
par accident.

## Ce que ça vaut dans l'audit

Le module Équipe (MOD-15, gestion des comptes) apparaît comme **présent dans le code et
volontairement inactif**. C'est un choix daté, pas un oubli :

- l'interface est masquée en production ;
- aucune donnée équipe n'existe en base ;
- les neuf RPC sont absentes, donc l'absence est **cohérente** avec le reste : une base
  sans les tables ne doit pas avoir les fonctions.

**Ce qui serait une faute**, et qui n'a pas été commise : appliquer 104→120 « pour que
le module marche » sans achever l'isolation par site. Un module de gestion des accès
mal isolé, c'est-à-dire l'endroit exact où l'on décide qui voit quoi, est la pire pièce
où improviser.

## Reste à faire pour l'activer

1. Achever l'isolation par site des quatre tables `equipe_*` (c'est la condition posée
   dans les brouillons eux-mêmes).
2. Passer 104 → 120 dans la chaîne de déploiement, avec empreintes figées.
3. Écrire les tests PGlite d'isolation : un membre d'un établissement ne doit jamais
   voir une demande, une invitation ou une affectation d'un autre.
4. Retirer le garde-fou (ou l'élargir à la préproduction) **en dernier**, une fois les
   trois points précédents prouvés.

## Leçon pour l'audit

Une fonction appelée et absente de la base n'est pas automatiquement un défaut. Il faut
vérifier **s'il existe un chemin d'exécution**. Ici il n'y en a pas. Confondre les deux
aurait conduit à appliquer des migrations de sécurité non validées pour « réparer » un
module qui n'était pas cassé — exactement la faute que la prudence demande d'éviter.
