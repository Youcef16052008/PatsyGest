# Restauration du pilote — procédure D5 / D6 / D7

> **Statut : procédure prête, non exécutée.** Elle attend deux apports humains :
> 1. une **sauvegarde réelle du pilote** (workflow `sauvegarde-free.yml`, en cours de
>    débogage des identifiants) ;
> 2. un **environnement Supabase isolé et représentatif** (branche ou projet dédié).
>
> Aucun projet de test (ex. `gmmjrzyhvihxvaqvuoxy`) ne doit être utilisé pour contourner
> l'interdiction du plan — voir `patisgest-app/migrations/ETAT-RESTAURATION.md`.
> Un test sur données fictives (`rejeu2`, run 44725686722) ne prouve **pas** la
> restauration du pilote.

Référence : `patisgest-app/migrations/ETAT-RESTAURATION.md`,
`patisgest-app/migrations/SAUVEGARDE-EXPERIMENTALE.md`,
[[PLAN-CORRECTIF]].

---

## 1. Ce que la sauvegarde doit couvrir

La copie partielle actuelle (`.github/workflows/sauvegarde-free.yml`) ne suffit pas.
La sauvegarde de référence doit inclure :

| Composant | Méthode | Contrôle |
|---|---|---|
| Données + schéma | `pg_dump -Fc` (ou dumps CLI Supabase) | relecture + `pg_restore -l` |
| Propriétaires, rôles, ACL | `pg_dump --no-owner` **et** dump des rôles/ACL | comparaison des ACL restaurées |
| Fonctions, policies, vues | inclus dans le dump | comparaison des définitions |
| `auth.users`, `auth` config | dump schéma `auth` + table | comptage + isolation testée |
| Storage (buckets, objets) | export des buckets + octets | pilote à 0 objet au dernier contrôle, à re-vérifier |
| Configuration (JWT, providers, SMTP) | lecture seule, pas de secret dans les journaux | comparaison des réglages non secrets |

**Cohérence** : les trois captures ne partagent pas un instantané. En production il faut
une fenêtre d'arrêt vérifiée des écritures (y compris Auth et Storage) ou une méthode de
capture cohérente. Un dump d'une base sans écritures est un prérequis minimal.

## 2. Restauration (D5/D6)

Cible : l'environnement isolé fourni, **vierge**.

```bash
# 2.1 Déchiffrer la sauvegarde (coffre GCM, phrase hors dépôt)
node patisgest-app/scripts/coffre-sauvegarde.mjs dechiffrer <coffre.pgcgcm> cible.dump

# 2.2 Reconstruire l'application dans la cible, dans l'ordre
#     historique 01-23 -> brouillons 101-128 -> 32 -> 33..39 (garde stricte à chaque pas)
#     (la cible est supposée porter le même état de départ)

# 2.3 Restaurer, sans les propriétaires (les rôles de la cible diffèrent)
pg_restore --no-owner --no-privileges -d "$CIBLE" cible.dump

# 2.4 Neutraliser les droits par défaut introduits par la base neuve
#     (une base neuve réintroduit anon/authenticated/service_role sur tables et fonctions)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
```

## 3. Comparaisons (D6)

Empreintes **avant** (sur la source) et **après** (sur la cible), identiques attendues :

1. lignes des tables publiques (`count` + `md5` agrégé par table, tri) ;
2. policies : `policyname, cmd, roles, qual, with_check` ;
3. ACL : `relname, relacl` ;
4. fonctions : `proname, prosrc` (hors `SECURITY DEFINER` volontairement absents) ;
5. `auth.users` : comptage + `md5` des champs non secrets ;
6. schéma : tables, vues, séquences, types.

Écarts attendus à investiguler : tables vectorielles (`storage.buckets_vectors`,
`storage.vector_indexes`) exclues du dump CLI ; définitions `SECURITY DEFINER`
sensiblement différentes.

## 4. Retour arrière (D7)

Le retour arrière doit être **opéré et observé**, pas supposé :

1. snapshot de l'état cible **avant** migration (résultat des comparaisons §3) ;
2. application de la migration testée ;
3. application du retour arrière (nouvelle migration à gardes strictes —
   jamais l'édition d'une migration appliquée) ;
4. rejeu des comparaisons : l'empreinte doit revenir à l'état du point 1.

## 5. Critères d'acceptation

- [ ] sauvegarde réelle du pilote déchiffrée et relue sans erreur ;
- [ ] restauration complète sur l'environnement isolé, sans erreur bloquante ;
- [ ] comparaisons §3 identiques (hors écarts listés) ;
- [ ] deux comptes de clients restaurés : isolation vérifiée, anonyme refusé ;
- [ ] retour arrière exécuté et empreinte restaurée ;
- [ ] aucun secret dans les journaux, le dépôt ou les artefacts.

Tant qu'un de ces critères manque, **pas d'application des migrations 33-39 au pilote et
pas de fusion**.
