# Check-list 60 cas — ce qui est couvert, et comment

La roadmap demande une « check-list 60 cas » en Sprint 6. Ce document dit
**exactement** ce qui est vérifié automatiquement, ce qui l'est manuellement en
base, et ce qui reste à faire dans un navigateur.

Point important : **deux pièges de protocole** ont rendu mes premiers tests
faux. Ils sont documentés ici parce qu'ils invalidaient des conclusions, et
parce que la même erreur se reproduira si personne ne l'écrit.

---

## 1. Le piège qui invalidait les tests RLS

La session du connecteur SQL est **`postgres`, superutilisateur** : elle
**contourne la RLS**. Un test qui pose seulement `request.jwt.claims` ne teste
donc rien.

Et `set_config('role', 'none', true)` **ne change pas** de rôle : PostgreSQL
comprend « garde ton rôle actuel ». Ma première version utilisait `none`.

Conséquence concrète : mes premiers tests ont « démontré » deux fuites qui
n'existaient pas (le labo modifiant le NIF, le vendeur lisant les coûts). Après
correction du protocole, **les deux se sont révélés conformes**.

Le protocole correct (encodé dans `src/lib/rls-probe.ts`, testé) :

```sql
select auth_user_id into v_uid from public.utilisateurs where email = '<persona>';
perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
perform set_config('role', 'authenticated', true);   -- indispensable
```

---

## 2. Matrice RLS des 4 personas — mesurée

Relevé réel en base, transaction annulée, base vérifiée intacte après.

| Persona | Coûts lus (pc / rv) | Ventes lues | Insert article | Maj identité légale |
|---|---|---|---|---|
| **vendeur** (amine) | **0 / 0** ✅ | 2 | **42501 refusé** ✅ | **0 ligne** ✅ |
| **labo** (sara) | 0 / **2** ✅ | 2 | accepté ✅ | **0 ligne** ✅ |
| **propriétaire** (amina) | 0 / **2** ✅ | 2 | accepté ✅ | **1 ligne** ✅ |

`pc` = `parametres_couts` (vide dans le jeu pilote), `rv` = `recette_versions`
(porte `mo_min`, énergie, frais généraux — donc les coûts).

**12/12 conformes.** Les trois règles tenues :

1. Le vendeur **ne lit aucun coût** et **ne peut pas toucher au stock**.
2. Le labo lit les coûts et réceptionne, mais **ne peut pas réécrire l'identité
   légale** (NIF/NIS/RC restent au propriétaire).
3. Seul le propriétaire modifie l'identité de l'établissement.

Complément mesuré plus tôt : `anon` **sans JWT** lit **0 ligne** sur
`clients`/`utilisateurs`/`ventes`/`parametres_couts`, et son `INSERT` sur
`sites` est refusé (`42501`).

---

## 3. Cas métier vérifiés en base

| # | Cas | Résultat |
|---|---|---|
| 1 | Vente FEFO sur un lot disponible | 2 PF-CRO → `totalHT` 170.00, `totalTTC` **202.30** (85×2×1,19) ; stock 74 → 72 |
| 2 | Rejeu du **même ticket** | `duplicate: true`, **même `sale_id`**, 1 seule vente, stock inchangé au rejeu |
| 3 | Quantité > stock | vente enregistrée avec `missing = 99927` — **choix délibéré** du code : « écart sans lot, jamais de stock négatif » ; l'UI affiche « Manquant : N (signalé, stock jamais négatif) » |
| 4 | Vendeur appelant `creer_of` | `P0001 Role non autorise a creer des OF.` |
| 5 | Vendeur écrivant un article | `42501` (policy `articles_tenant_insert` exige propriétaire/labo) |
| 6 | Labo réécrivant l'identité légale | 0 ligne modifiée, NIF intact |

Toutes ces exécutions se sont terminées par un `rollback` : la base du pilote
est **inchangée** (`nif = NIF 123456789`, 2 ventes, 12 lots — vérifié après
chaque campagne).

Un point honnête sur le cas 3 : **ce n'est pas un bug**, c'est un arbitrage
écrit dans la migration 06 et dans le cahier (« alerte, jamais blocage »). Une
vente au comptoir passe même si la marchandise n'a pas été saisie en stock ;
l'écart est tracé, jamais silencieux. C'est discutable pour une gestion de
stock stricte — **à confirmer avec le pilote**, ce n'est pas à moi de trancher.

---

## 4. Ce qui nécessite un navigateur (non fait)

| Cas | Pourquoi hors sandbox |
|---|---|
| Écran de connexion, session réelle Supabase Auth | pas de route vers `*.vercel.app` |
| File hors-ligne (vente pendant une coupure réseau) | demande de couper réellement le réseau du navigateur |
| Impression du ticket 80 mm (marges, coupe) | dépend de l'imprimante thermique |
| Assistant d'onboarding en < 1 h | chronométrage humain |
| Sauvegarde/restauration depuis l'écran Paramètres | téléversement de fichier réel |
| Étiquettes allergènes imprimées | format d'étiquette physique |

Ces points sont **déjà listés** dans `HANDOFF.md` §10.4 et dans la PR #3.
Ils ne sont pas contournables depuis la sandbox et **rien ici ne les remplace**.

## 5. Couverture automatisée correspondante

**260 tests** `npm test`, dont :
- `rls-probe.test.mjs` (12) — protocole RLS, personas, matrice d'écarts ;
- `securite.test.mjs` (17) — 17 invariants exécutables ;
- `etablissement.test.mjs` (15) — NIF/NIS/RC, en-tête de ticket ;
- `sauvegarde.test.mjs` (19) — format, ordre FK, empreinte.

Et `test:smoke` **10/10** — routes, gardes HTTP, cookies signés.
