# Sprint 6 — fin : US-15.1 & US-15.2

Suite de `SPRINT6.md`. Deux écarts **mesurés avant de coder**, pas des cases cochées.

## US-15.1 — mentions légales

**Écart** : le ticket imprimé titrait « PâtisGest — Caisse ». Aucune mention
légale (NIF, NIS, RC, adresse) alors que le §5 les exige. Les colonnes
existaient dans `clients` mais **aucun écran ne les éditait**.

| Livré | Fichier |
|---|---|
| Validation NIF/NIS (15 chiffres) + RC wilaya/registre, en-tête, avertissements | `src/lib/etablissement.ts` |
| Édition propriétaire, lecture pour les autres rôles | `src/app/(app)/parametres/page.tsx` |
| Formulaire + aperçu de l'en-tête | `src/components/etablissement-form.tsx` |
| Server action (garde rôle + `messageUtilisateur`) | `src/lib/actions-etablissement.ts` |
| Ticket porteur des mentions légales | `src/components/sale-ticket.tsx`, `sale-form.tsx`, `[module]/page.tsx` |

Choix : une identité incomplète **ne bloque pas l'encaissement** (cahier
« alerte, jamais blocage »). Elle s'affiche en rouge dans `/parametres`, le
ticket sort avec ce qui existe, et **n'invente jamais** un identifiant manquant.

⚠️ Les données du pilote ne sont pas conformes : `NIF 123456789` (9 chiffres au
lieu de 15). L'app le signale ; au propriétaire de fournir les vrais.

## US-15.2 — restauration

**Découverte bloquante** : **11 tables sur 22 n'ont aucune policy INSERT**
(`ventes`, `clotures`, `recette_versions`, `recette_familles`,
`ordres_fabrication`, `transferts`, `bons_commande`, `cakes`,
`historique_prix`, `fournisseurs`, `z_imports`) — écriture par RPC
`SECURITY DEFINER` uniquement. Une restauration par `INSERT` client aurait
échoué en cours de route : base **à moitié restaurée**, succès annoncé.

**Livré**

| Élément | Rôle |
|---|---|
| `supabase/18-restauration-sauvegarde.sql` | `restaurer_sauvegarde(jsonb)` : SECURITY DEFINER, `search_path=''`, garde `proprietaire`, une transaction, ordre topologique, refus multi-tenant |
| `src/lib/sauvegarde.ts` | format versionné, empreinte FNV-1a, sérialisation canonique, validation avant écriture |
| `src/app/api/sauvegarde/route.ts` | export JSON complet, propriétaire seulement, `no-store` |
| `src/lib/actions-restauration.ts` | analyser → confirmer (taper `RESTAURER`) |
| `src/components/sauvegarde-panel.tsx` | 2 clics, résumé avant écriture |
| `tests/sauvegarde.test.mjs` (15) + 3 invariants dans `tests/securite.test.mjs` | contrat du fichier + protection de la RPC |

**CA-15 prouvé sur la base réelle** (transaction annulée, base intacte vérifiée) :
dump de 8 tables → vidage → restauration 39 lignes → **empreinte identique** →
rejeu idempotent (0 insérée, 39 ignorées).

**Gardes en base, 5/5** : vendeur refusé · labo refusé · autre tenant refusé ·
ligne `client_id` étrangère refusée · sans JWT refusé. `anon` n'a pas le droit
d'exécuter, `public_exec = 0`.

## Portes

`typecheck` 0 · `lint` 0 · `test` **239/239** · `build` OK (8 routes) ·
`test:smoke` **10/10**.

## Ce qui n'est toujours pas prouvé

- Restauration **jamais exercée dans un navigateur** sur l'URL de production.
- Restauration réelle sur une base de production vierge non faite (seulement en
  transaction annulée).
- `utilisateurs` absent du dump (rattaché à `auth.users`).
- CA-15 « onboarding < 1 h », E2E Auth réelle, journée sans internet,
  coûts 3 pâtissiers, check-list 60 cas : **toujours ouverts**.
