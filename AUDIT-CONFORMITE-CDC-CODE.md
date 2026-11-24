# PâtisGest — Audit de conformité CDC v4.0 / Architecture v4.0 → code réel

**Rôle :** revue senior, traçabilité exigences → implémentation
**Référence de l'audit initial :** `dfd8235` (= `main` d'alors, PR #12 fusionnée)
**Supplément de statut :** `50509b7`, 23 novembre 2026 — voir §0 bis et §4 bis

> **Ce document est daté.** Il a été écrit en un seul passage, sur un commit précis.
> Les écarts qu'il décrit ont ensuite été traités (ou explicitement reportés), et
> l'état réel ne se lit pas dans le corps ci-dessous mais dans les **deux sections
> ajoutées** : `§0 bis — ce qui a été traité depuis` et `§4 bis — matrice à jour`.
> Les chiffres du corps (« 458 tests », « 39 migrations », « journal_audit absent »)
> sont **ceux du commit audité**, conservés comme trace. Ne pas les lire comme l'état
> courant.
**Documents de référence :** `01-Cahier-des-Charges-v4.md` (427 l.), `02-Architecture-Technique-v4.md` (244 l.), `03-Roadmap-v4.md` (163 l.)
**Méthode :** lecture des 3 documents, puis audit des 162 fichiers TS/TSX, 39 migrations SQL, 73 fichiers de tests. Les contrôles ont été **exécutés**, pas supposés.

---

## 0. Verdict en une page

**Le produit est meilleur que ce que son propre README prétend, et plus en retard que ce que la roadmap prétend.**

Mesures réelles du commit audité :

| Contrôle | Résultat | Statut |
|---|---|---|
| `npx tsc --noEmit` | 0 erreur | ✅ |
| `npm run lint` | 0 erreur | ✅ |
| `npm test` | **458 réussis / 0 échec / 3 ignorés / 3 todo** sur 464 | ✅ |
| Fichiers de tests | 73 | ✅ |
| Migrations SQL | 39 (+ 28 brouillons 101–128 non déployés) | ⚠️ |
| Modules du CDC implémentés | **12 sur 15** | ⚠️ |
| Codes `MOD-xx` dans le code | **0** | ❌ |

Sur le **cœur métier**, la conformité est excellente. Sur **ce qui empêche de vendre**, l'écart est total, et il ne vient pas du code.

Trois écarts majeurs, classés par gravité commerciale :

1. **Le hors-ligne — obligatoire (H2), non négociable — n'est pas livré.** Il existe une file de ventes et une file d'OF, mais **aucune lecture hors-ligne**. Or une caisse qui en ligne fonctionne et dont le catalogue disparaît quand le réseau tombe n'est pas une caisse hors-ligne : c'est une caisse en ligne avec une mémoire.
2. **35 % du CDC n'est pas codé du tout**, dont deux modules *Must* : **MOD-15 (journal d'audit, exports comptables, restauration en 2 clics)** et **MOD-03 US-03.3 (liste de courses automatique)**. `journal_audit` — exigé 10 ans par NF-10 et RI-06 — n'existe pas en base.
3. **~2 150 lignes (1 158 SQL + 987 TS) ont été écrites pour une fonctionnalité absente des trois documents** : la vitrine publique. Pendant ce temps, MOD-15 était à zéro.

Et une divergence de fond que personne n'a relevée : **le CDC dit littéralement « le SQL de création sera généré depuis Drizzle » (Architecture §4), et le projet a fait l'inverse — supprimer Drizzle** (F-11). La décision est la bonne ; c'est le **document** qui est faux. Tout développeur qui reprend le projet en suivant l'Architecture v4.0 va réintroduire une dépendance supprimée. C'est exactement ce qu'ont fait les trois agents du dossier Drive précédent.

---

---

## 0 bis — Ce qui a été traité depuis l'audit

**État au `889a94b` : 567 tests réussis / 0 échec / 2 todo (écarts mesurés)**, `tsc` et
`lint` propres, 43 migrations SQL, 89 fichiers de tests, **6 todo dont 3 écarts mesurés**. **Base pilote en version 43.**

| Écart | Statut | Preuve |
|---|---|---|
| A — hors-ligne non livré | 🟡 **traité sur le périmètre D5** | Coquille `/hors-ligne` cloisonnée par compte, catalogue alimenté par la caisse, 4 contrôles d'accès ordonnés. Les écrans authentifiés restent hors-ligne-inaccessibles : c'est la conception retenue, pas un oubli. Périmètre D5 validé par le propriétaire |
| B1 — `journal_audit` absent (NF-10) | ✅ **fermé et appliqué** | Migration 40 **appliquée au pilote le 23/11/2026**. 8 déclencheurs vérifiés en base ; un `update` réel produit une ligne ; un `update` sur le journal est refusé (`42501`). Panneau de lecture dans Paramètres |
| B2 — liste de courses (US-03.3) | ✅ **fermé** | `liste-courses.ts` + `courses-server.ts` + panneau branché dans le module |
| B3 — avoirs/retours (US-06.4) | ✅ **fermé** | Migration 41 `enregistrer_avoir` + `AvoirForm` branché dans la caisse, remise en stock ou destruction tracée |
| B4 — export comptable (§8.3) | ✅ **fermé** | `export-comptable.ts` (date, pièce, compte auxiliaire, HT, TVA, TTC) + route `/api/export/comptable` + bouton dans le panneau d'export |
| B5 — restauration (US-15.2) | ⏸ **reporté, décision datée** | Décision du 23 novembre 2026 : reportée jusqu'à 15 clients, puis option payante. La dette est nommée : aucune sauvegarde n'est prouvée restaurable |
| D — documentation fausse | ✅ **fermé** | Architecture v4 réécrite : plus de Drizzle, état réel du hors-ligne, de l'audit, de la politique de mot de passe, RI-05 corrigé |
| NF-01 — dashboard < 2 s | ✅ **mesuré** | 400 lots lus en 13 ms, 700 ventes en 9 ms sur 18 000 ventes ; `lirePages` borné à 20 000 lignes + sonde |
| NF-02 — 0 perte hors-ligne | 🟡 **conçu et cloisonné**, pas éprouvé en boutique sans réseau | Voir écart A |
| NF-05 — 18-07 (code) | ✅ **fermé et appliqué** | Migration 42 **appliquée le 23/11/2026**. Anonymisation réelle testée en base : nom effacé, 8 ventes conservées, trace écrite. 8 tests. **On anonymise, on ne supprime pas** |
| NF-05 — DPA signé + région | 🟡 **moitié faite** | **Région relevée : `eu-west-1` (Irlande), Supabase et Vercel** — c'est la partie vérifiable, et elle est conforme (UE). **DPA : toujours non signé** → `PROTOCOLE-QUALIFICATION-MATERIELLE.md` §3 |
| NF-06 — ticket 80 mm | 🟡 **code prouvé, papier non** | 7 tests (80 mm, 4 mm, plancher 10 px, NIF/NIS/RC, HT/TVA/TTC). **Aucun ticket n'a jamais été imprimé.** Protocole §1 |
| NF-07 — ≤ 3 clics, 3 novices | 🟡 **code prouvé, humain non** | 6 tests (2 clics, 44 px, 11 px, 10 champs). **Aucune personne extérieure n'a utilisé le logiciel.** Protocole §2 |
| 5.5 — politique de mot de passe | 🟡 **écrite et versionnée, non appliquée** | `patisgest-app/SECURITE-COMPTES.md` : 12 caractères, JWT 12 h, rotation, inscriptions fermées, procédure et relevé. **Le relevé est vide : personne ne l'a encore exécutée** |
| C — 2 150 lignes de vitrine hors CDC | ⚠️ **inchangé** | Toujours hors périmètre. Décision produit, pas dette technique |
| F — contradiction de prix | ⚠️ **inchangé** | Décision commerciale, hors code |
| G — pilote ≠ dépôt | ⚠️ **inchangé** | Nécessite un accès au projet réel |
| **H — les 9 vues par rôle n'existent pas** | 🔴 **mesuré en base, non corrigé** | `labo_articles`, `labo_lots`, `labo_recette_versions`, `labo_ordres_fabrication`, `labo_cakes`, `labo_bons_commande`, `labo_ventes_quantites`, `vendeur_lots`, `vendeur_ordres_fabrication` sont lues par l'app et **absentes de la base** (42P01 vérifié). Elles n'existent que dans les brouillons 101/115/116, jamais appliqués. Mesuré compte par compte : les **8 modules du labo** affichent une erreur ou un écran vide ; la **caisse du vendeur fonctionne** (FEFO côté serveur) mais sans aucune indication de stock ni alerte DLC ; le **vendeur lit `lots.pu`** (prix d'achat, 13/13 lots = 8 056 DZD) — exactement ce que les vues devaient masquer. Détail et recommandations : `patisgest-app/migrations/VUES-ROLES-ABSENTES.md` |
| **I — la chaîne 01→43 ne se rejoue pas** | 🔴 **mesuré, non corrigé** | Sur schéma vierge, **43 fichiers, 4 échecs**. Hors seed (`auth.users`, faux positif) : `09` référence `clotures.revision` et `articles.pu_ht` qu'aucune migration ne crée ; `17` révoque `rls_auto_enable()` qu'aucune migration ne définit ; `23` échoue en cascade. La base pilote **a** ces colonnes (`revision`, pas `pu_ht`, pas `agent_id`) : dépôt et base ont divergé, et le fichier `09` décrit un état **antérieur** aux corrections faites à la main. Conséquence : **on ne peut pas recréer la base depuis le dépôt** — donc la restauration (B5) n'est pas seulement reportée, elle n'est pas possible en l'état. Détail et sortie recommandée (migration 44 d'alignement) : `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` |
| **H bis — pourquoi la suite ne l'a pas vu** | ⚠️ **angle mort nommé** | `tests/labo-confidentialite-db.test.mjs` **applique le brouillon 101 lui-même** avant de tester : il prouve que le brouillon est correct, jamais qu'il est déployé. Deux tests ajoutés (`tests/vues-roles-recette.test.mjs`) comparent le code aux migrations applicables ; ils sont marqués `todo` tant que le défaut est ouvert, pour garder la suite verte **sans effacer le signal** |

### Ce qui a changé en base, pas seulement dans le dépôt (23/11/2026)

Les migrations 39 à 43 étaient écrites, testées en PGlite, et **appliquées nulle part**.
C'est le défaut le plus grave que cet audit pouvait laisser passer : une migration
jamais appliquée n'est pas une fonctionnalité, c'est un fichier.

Elles sont maintenant appliquées au projet pilote (`app_schema_version` 38 → **43**),
une par une, avec point de retour écrit avant de commencer
(`migrations/APPLICATION-39-42.md`), et un contrôle de non-régression : les 20
comptages de données d'avant sont identiques après.

**Trois défauts ont été trouvés en appliquant, et aucun n'était visible dans les tests :**

1. La migration 39 révoquait `UPDATE` sur toute la table `clients` pour protéger `offre`.
   Effet : l'écran Paramètres ne pouvait plus enregistrer NIF/NIS/RC, donc **les tickets
   perdaient leurs mentions légales** — l'exigence NF-06, cassée par une migration qui
   visait la facturation. Corrigé en grant par colonne.
2. L'export de la 42 construisait sa référence avec `now()`, figé par transaction : deux
   exports dans la même transaction violaient la contrainte unique. Un droit d'accès
   refusé pour une collision de clé. Corrigé + test qui appelle deux fois.
3. RI-04 n'était pas « faut-il une unicité sur le numéro de lot ». Une contrainte
   `(client, numéro)` aurait cassé **tous les transferts**, puisque le transfert crée un
   miroir portant le même numéro (MOD-11). La bonne clé est
   `(client, article, site, numéro)`, partielle, pour n'interdire que la double réception.

**Ce que ça enseigne, et qui doit rester écrit :** ces trois défauts ne se voient pas
dans un test unitaire. Ils se voient en confrontant les GRANT aux appels réels, et les
contraintes aux RPC qui écrivent. C'est la différence entre « le code est juste » et
« le système fonctionne ».

**Ce qui a réellement changé : les écarts qui étaient du code ont été fermés, prouvés
par des tests, et désormais appliqués en base. Les écarts qui demandent une imprimante,
trois personnes et une signature sont maintenant décrits par un protocole exécutable —
et restent ouverts.**
La différence entre les deux catégories est exactement ce que cet audit doit rendre
visible : un test vert ne remplace pas un ticket imprimé.

## 1. Méthode et limites

**Ce que j'ai fait :** lecture intégrale des 3 documents ; inventaire exhaustif des routes, composants, librairies, tables SQL, triggers, policies et tests ; exécution de `tsc`, `lint`, `npm test` après `npm install` ; lecture ciblée du code pour chaque règle `RG-xx` et `RC-xx` vérifiable ; vérification de l'atteignabilité des modules dans la navigation.

**Ce que je n'ai pas fait :** aucune connexion à la base pilote (Supabase), aucune écriture, aucune migration appliquée, aucun déploiement. Les tests d'intégration qui exigent `PATSYGEST_PG_URL` n'ont donc pas tourné ici — ils sont **ignorés**, pas validés. **Le « 458 vert » porte sur les tests unitaires et PGlite**, pas sur le pilote.

**Limite à assumer :** l'état de la base pilote peut différer du dépôt (c'est documenté : la migration 32 existe en base sans fichier source, et la RPC `patisgest_demander_commande` diffère entre les deux). Un audit de code ne remplace pas un audit de base.

---

## 2. Ce qui est fait, et bien fait

Pour être honnête dans les deux sens : le cœur du produit est solide.

### 2.1 Les formules de référence — conformes intégralement

`src/lib/cost-sheet.ts` implémente **RC-01 à RC-10** avec les formules exactement telles que gravées au CDC §4 : parage `×(1+p)`, cuisson `×(1−c)`, MO chargée `(min/60)×taux×(1+charges)`, coût/portion sans TVA, marge toujours sur HT, taux de perte, manque à gagner, garde-fous ×10/÷10 et prix >2× non bloquants. Les bornes sont validées et lèvent une erreur en français.

Le CDC dit : *« Tout écart est un bug bloquant. »* **Aucun écart de formule n'a été trouvé.** C'est le point le plus critique du produit et il est tenu, avec un test dédié (`rc-reference.test.mjs`).

### 2.2 Le FEFO — conforme à RC-09, y compris les pièges

`src/lib/fefo-cost.ts` respecte l'ordre SQL exact : `congele asc, dlc asc nulls last, date_reception asc, id asc`. Les lots bloqués, périmés et à quantité nulle sont exclus ; les lots sans prix connu sont comptés séparément (`sansPrixConnu`) — correction F-16 appliquée. Un test de **parité SQL↔TypeScript** existe (`fefo-parite-db.test.mjs`) : c'est la bonne façon de faire.

### 2.3 Les modules métier présents

| Module CDC | Réalité | Note |
|---|---|---|
| MOD-01 dashboard | `dashboard-insights.ts`, `productVelocity` | Partiel — voir §3 |
| MOD-02 articles/lots/FEFO | Complet, 3 niveaux, motifs | ✅ |
| MOD-03 achats/fournisseurs | BC + réception + alerte prix >10 % (`PRICE_ALERT_THRESHOLD = 10`, conforme US-03.2) | Partiel — pas de liste de courses |
| MOD-04 recettes/coûts | Versions immuables, sous-recettes figées, fiche coût | ✅ |
| MOD-05 production/OF | Snapshot, partiel, coût réel vs prévu | ✅ |
| MOD-06 caisse | Panier, ticket 80 mm avec NIF/NIS/RC, import Z, file hors-ligne | Partiel — pas d'avoir |
| MOD-07 clôture | **6 flux complets** (vendu, reporté, jeté, casse, offert, + fabriqué) | ✅ |
| MOD-08 cake design | Acompte 30 % bloquant, rétroplanning, CGV | ✅ |
| MOD-09 HACCP | T°, nettoyage, NC, alertes seuils | ✅ |
| MOD-10 allergènes/étiquettes | 14 allergènes annexe II, calcul récursif matières→produits, étiquette imprimable | ✅ |
| MOD-11 traçabilité/rappels | Amont/aval, simulation rappel, blocage lot | ✅ |
| MOD-12 planning | Tâches, durées, OF liés | Partiel — pas de charge vs capacité |
| MOD-13 simulation prix | Autonome (hors écriture en base) | ✅ |
| MOD-14 multi-sites/transferts | Transferts, stocks par site | ✅ |
| MOD-15 admin/données/exports | Exports CSV oui | ❌ **Journal d'audit absent, restauration non prouvée** |

**12 modules sur 15 sont fonctionnels.** Sur le papier, ce produit est très largement au-delà d'un MVP.

### 2.4 La qualité d'ingénierie

`tsc` 0, `lint` 0, 458 tests verts, un test de parité TS↔SQL, un test de parité des migrations par empreinte SHA-256, des tests de protocole RLS qui ont même **corrigé de faux positifs** (documenté dans `CHECKLIST-60.md` : la session `postgres` contourne la RLS). Cette rigueur est rare et c'est un actif réel.

---

## 3. Ce qui manque — écart par écart

### ÉCART A — Le hors-ligne (H2, NF-02, D5) : architecture centrale, non livrée

**Le CDC, Architecture §6 :** outbox avec UUID client, poussée dans l'ordre, idempotence, deltas au retour. **NF-02 :** « caisse, OF, T°, clôture utilisables sans internet, 0 perte ».
**H2 :** « le hors-ligne est **obligatoire**, pas optionnel ».

**Ce qui existe :**
- `src/lib/sale-queue.ts` (file de ventes, localStorage, UUID stable, idempotence) — branché dans `sale-form.tsx`
- `src/lib/of-queue.ts` (file d'OF) — branché dans `of-forms.tsx`
- `public/sw.js` — service worker

**Ce qui n'existe pas :** la colonne vertébrale.

Le service worker déclare lui-même, en tête de fichier :

> « l'ouverture hors ligne d'une page authentifiée est volontairement désactivée jusqu'à conception isolée »

**Conséquence concrète :** en ligne, le vendeur encaisse. Le réseau tombe. Il ouvre la caisse → **page non servie**. Les files ne servent à rien si l'écran ne se charge pas.

Second manque : **il n'y a pas de base locale de données**. La file stocke des *écritures* ; rien ne stocke le *catalogue* (articles, lots, prix). Or la caisse a besoin des prix pour encaisser. `catalogue-cache.ts` existe mais n'est pas une réplication hors-ligne.

Troisième manque : **NF-02 exige aussi T° et clôture hors-ligne** (périmètre D5). Les files ne couvrent ni l'un ni l'autre.

**Verdict : le hors-ligne est à ~30 %.** La partie difficile (idempotence, UUID, ordre) est faite et testée. C'est la partie visible qui manque, et c'est celle que le pilote verra.

**Pourquoi c'est le n°1 :** parce que tu as vendu « un logiciel qui ne te bloque jamais » (promesse produit §1.2), et parce que le CDC dit « obligatoire » mot pour mot. Si un pilote perd une vente à cause du réseau, tout le reste de ce rapport devient secondaire.

### ÉCART B — 35 % du CDC n'est pas codé

**B1. Le journal d'audit — absent.** NF-10 et RI-06 exigent « qui, quoi, quand » sur ventes/stocks/clôtures, **conservé 10 ans**. Architecture §4.1 prévoit la table `journal_audit`. Recherche exhaustive dans les 39 migrations : **`journal_audit` n'existe pas.** Il n'y a ni table, ni trigger, ni policy. Aucune action n'est auditée.

Ce n'est pas seulement un manque fonctionnel : c'est **une exposition réglementaire**. La conservation 10 ans (Code de commerce, CDC §5) et l'aptitude à présenter des données au fisc ne s'improvisent pas rétroactivement. Chaque jour en production sans journal est un jour non auditable.

**B2. La liste de courses automatique (US-03.3) — absente.** Aucune occurrence de « liste de courses » dans `src/`. Les besoins des OF sont calculés (MOD-12 partiel), mais l'agrégation `besoins − stock − en commande` n'est pas exposée.

**B3. Les avoirs/retours (US-06.4) — absents.** Pas de table `retours_avoirs`, aucune fonction. Un vendeur ne peut pas corriger une vente. Toute erreur de caisse se règle hors logiciel.

**B4. L'export comptable structuré (§8.3) — absent.** L'export CSV de `ventes` existe, mais l'export au format comptable exigé — *date, pièce, compte auxiliaire, HT, TVA, TTC* — n'existe pas. Un comptable ne peut pas passer une écriture depuis un export de ventes brutes.

**B5. La restauration en 2 clics (US-15.2) — non prouvée.** Le code et les routes existent ; c'est la **preuve** qui manque. `migrations/ETAT-RESTAURATION.md` et le `README` disent explicitement qu'aucune restauration complète n'a été démontrée, et le rapport consolidé liste D5/D6 comme ouverts.

### ÉCART C — 2 150 lignes hors périmètre (la vitrine)

**Vérification :** le CDC v4.0 mentionne « vitrine » **3 fois**, et les 3 fois désignent la **vitrine réfrigérée** de la pâtisserie (température, écriteau). Il n'y a **aucune exigence** de site public par boutique. L'Architecture ne la prévoit qu'incidemment (§8, « le routage devra être par hôte… avant la première boutique en ligne vendue »).

**Ce qui a été construit :**
- 7 migrations : `25-domaines-boutiques`, `26-vitrine-publique`, `27-commandes-vitrine`, `30-edition-vitrine-rpc`, `31-publication-vitrine`, `32-garde-prix-vitrine-rattrapage`, `38-anti-abus-vitrine-source` → **1 158 lignes SQL**
- `actions-vitrine.ts`, `domaines.ts`, `vitrine-form.tsx`, `vitrine-commande.tsx`, la route publique → **987 lignes**
- 6 fichiers de tests
- Des brouillons 125/126/127 encore ouverts

**Et c'est précisément là que se concentrent les risques de sécurité** documentés : la vue publique exposait `client_id` (D2), l'anti-abus est un compteur global de 30 req/h qui permet à un anonyme d'épuiser le quota de tout le tenant (D3b), et `sites_update_staff` autorise une écriture directe sur les colonnes de publication (D4). Trois constats ouverts, tous sur du code hors spec.

**Le raisonnement, dit franchement :** ce n'est pas « du travail inutile » — c'est un choix stratégique défendable (la vitrine aide à vendre). Mais **il a été fait avant MOD-15**, et il est **absent des trois documents**. Donc soit c'est un module, et il faut l'écrire au CDC avec ses exigences de sécurité ; soit c'est une erreur de priorité, et il faut savoir qu'elle a coûté ~2 semaines de développement solo.

### ÉCART D — Le CDC et l'Architecture sont faux sur leur propre stack

| Document | Affirmation | Réalité du code |
|---|---|---|
| Architecture §3 | « Accès données : **Drizzle ORM** — déjà en place, migrations simples » | **Supprimé** (F-11). 0 dépendance Drizzle. |
| Architecture §4 | « le SQL de création sera **généré depuis Drizzle** au démarrage » | **L'inverse** : 39 migrations SQL écrites à la main, figées par SHA-256 |
| Architecture §2 | Vercel + Supabase | ✅ conforme |
| Architecture §3 | Tauri en V4, pas Electron | ⚠️ Or `patisgest-desktop/` **est** un projet Electron |

**C'est l'écart le plus coûteux à long terme**, parce qu'il se propage. Un développeur, une IA, un prestataire qui ouvre `02-Architecture-Technique-v4.md` va coder du Drizzle — et son code ne compilera pas. **C'est exactement ce qui s'est passé dans les trois livraisons du dossier Drive** que j'ai analysé précédemment : trois agents ont produit du Drizzle + `@/db` parce que c'était écrit dans l'architecture, et aucun des trois ne compile.

Le CDC, lui, est propre sur la stack (il est fonctionnel). C'est l'Architecture qu'il faut corriger.

### ÉCART E — Les exigences non fonctionnelles non vérifiées

| # | Exigence | État réel |
|---|---|---|
| NF-01 | Dashboard < 2 s avec 1 an de données | ~~Non mesuré~~ → **✅ mesuré depuis** : 400 lots en 13 ms, 700 ventes en 9 ms sur 18 000 ventes. |
| NF-02 | 0 perte hors-ligne | **Non atteignable** (écart A) |
| NF-03 | Disponibilité ≥ 99,5 % | **Non mesurée.** Pas de sonde de disponibilité. |
| NF-04 | Mots de passe hashés, sessions, rôles, isolement | Hash : délégué à Supabase ✅. Rôles ✅ (matrice testée 12/12). **Isolation : D7 ouvert** (FK non tenant-composites sur la restauration). |
| NF-05 | Hébergement UE/DZ + **DPA signé** | **Code : ✅ fermé** (migration 42, export + anonymisation). **Juridique : ❌ ouvert** — aucun DPA signé, région non relevée. Protocole §3 du `PROTOCOLE-QUALIFICATION-MATERIELLE.md`. |
| NF-06 | Android 9+, Chrome, imprimante 80 mm | **Code : ✅ 7 tests.** Matériel : **❌ jamais testé** — aucun ticket imprimé. Protocole §1. |
| NF-07 | ≤ 3 clics, testé avec 3 novices | **Code : ✅ 6 tests** (2 clics, 44 px, 11 px). Novices : **❌ jamais testé** — aucune personne extérieure. Protocole §2. |
| NF-08 | RC-01..RC-10 verts à chaque version | ✅ **Conforme** (test dédié) |
| NF-09 | Sauvegarde quotidienne + **restauration testée mensuellement** | ❌ **Jamais démontrée** — et **reportée par décision du 23/11/2026** jusqu'à 15 clients, puis option payante. Dette nommée, pas effacée. |
| NF-10 | Journal d'audit 10 ans | ~~Absent~~ → **✅ migration 40** : table, déclencheurs, RLS propriétaire, lignes immuables. **Non appliquée en base réelle à ce jour.** |

**4 exigences sur 10 sont formellement violées ou non mesurables. NF-09 et NF-10 sont les deux plus graves**, et elles se rejoignent : *on ne peut pas certifier qu'on garde 10 ans ce qu'on ne sait pas restaurer.*

> **Depuis :** NF-10 est **fermé** (migration 40, journal immuable, RLS propriétaire).
> NF-09 est **reporté par décision datée** (15 clients), ce qui ne le ferme pas — la
> dette est nommée. NF-01 est **mesuré**. NF-06 et NF-07 restent ouverts côté preuve
> physique. Voir §0 bis ; le paragraphe ci-dessus est la photographie du commit audité.

Et une précision liée : l'architecture §7 promet « mot de passe fort (12 car. min), verrouillage après 5 essais, sessions 12 h ». **Rien de cela n'est configuré dans le dépôt** (aucun `supabase/config.toml`). C'est délégué au réglage du projet Supabase — donc **non versionné, donc invérifiable depuis le code**. À traiter comme une tâche d'exploitation, pas comme une ligne cochée.

### ÉCART F — Le contrat de prix et le CDC se contredisent

CDC §9 **D1** (décision « définitive ») : *Solo 2 900 DA/mois · Pro 5 900 · Groupe 9 900 (−20 % annuel), seuil ~35 clients.*
Roadmap §6 : la même grille, plus « installation 15 000 ».

Trois problèmes, dans l'ordre de gravité :

1. **Architecture §8 contredit D1** : « À 50 clients Solo (2 900 DA) : MRR 145 000 DA ». 50 × 2 900 = **145 000** — donc OK en mensuel pur. Mais la Roadmap dit « −20 % annuel » : le client annuel paie 2 320/mois, pas 2 900. **Le MRR de référence est surévalué** si les clients prennent l'annuel (ce que le CDC veut).
2. **Le seuil de rentabilité n'est pas le même** : CDC D1 dit ~35 clients, Roadmap §6 dit « ~9 clients Solo pour l'équilibre de trésorerie, ~35 pour un revenu fondateur de 100 000 DA/mois ». Ce ne sont pas les mêmes grandeurs et le CDC les a fusionnées par erreur.
3. **Le CDC D1 est intenable sur ce marché** (vérifié : Almawarid 10 000–20 000 DA/an, plan gratuit ; Symloop 35 000 ; Dolisoft 12 000 une fois). 34 800 DA/an pour un Solo sans marque se heurte à un plancher à 10 000.

**Ce n'est pas un bug du code** — le code ne touche pas au pricing. C'est un écart de document, et il est bloquant pour la vente.

### ÉCART G — Déploiement et base pilote non alignés

- Le dépôt et le **pilote** divergent (migration 32 en base sans fichier source ; RPC livrée ≠ RPC du dépôt).
- **28 brouillons de sécurité (101–128) non déployés.** Les migrations 33–39 du dépôt ne sont **pas** appliquées au pilote (mentionnées dans les handoffs).
- La **protection de branche** de `main` est inconnue (lecture des réglages refusée en HTTP 403).
- Le dépôt GitHub était **public** au dernier contrôle, malgré Architecture §3 « GitHub privé ».

---

## 4. Matrice de traçabilité — synthèse

| Exigence | Source | Code | Statut |
|---|---|---|---|
| RC-01..RC-10 | CDC §4 | `cost-sheet.ts` | ✅ **Conforme** |
| RC-09 FEFO multi-lots | CDC §4 | `fefo-cost.ts` + parité SQL | ✅ **Conforme** |
| MOD-01 dashboard CA/marge/perte | CDC | `dashboard-insights.ts` | 🟡 Partiel (pas de marge/perte consolidées) |
| MOD-02 articles/lots/FEFO | CDC M | complet | ✅ |
| MOD-03 achats + alerte 10 % | CDC M | `price-alerts.ts` | ✅ |
| MOD-03 US-03.3 liste de courses | CDC M | — | ❌ |
| MOD-04 recettes/versionnage | CDC M | complet | ✅ |
| MOD-05 OF snapshot/partiel | CDC M | complet | ✅ |
| MOD-06 caisse + ticket 80 mm | CDC M | complet | ✅ |
| MOD-06 US-06.4 avoirs | CDC S | — | ❌ |
| MOD-07 6 flux clôture | CDC S | `cloture-form.tsx` | ✅ (sauf RG-07.2 pré-remplissage) |
| MOD-08 cake acompte 30 % | CDC C | `patisgest-store.ts:489` | ✅ |
| MOD-09 HACCP | CDC M | complet | ✅ |
| MOD-10 allergènes 14 + étiquette | CDC M/S | `allergenes.ts`, `label-maker.tsx` | ✅ |
| MOD-11 traçabilité/rappel | CDC S | complet | ✅ |
| MOD-12 planning | CDC C | `planning-forms.tsx` | 🟡 Pas de charge vs capacité (480 min) |
| MOD-13 simulation | CDC C | complet, bac à sable | ✅ |
| MOD-14 multi-sites/transferts | CDC C | complet + test concurrence | ✅ |
| MOD-15 paramètres | CDC M | `parametres` | ✅ |
| MOD-15 US-15.2 restauration | CDC M | code oui, preuve non | ❌ **Non prouvée** |
| MOD-15 §8.3 export comptable | CDC | partiel | ❌ |
| NF-02 hors-ligne (H2) | CDC/Arch §6 | files seules | ❌ **~30 %** |
| NF-08 tests RC | CDC | `rc-reference.test.mjs` | ✅ |
| NF-09 restauration testée | CDC | — | ❌ |
| NF-10 journal audit 10 ans | CDC/Arch §4.1 | — | ❌ **Table absente** |
| RI-05 montants en centimes | Arch §4.2 | `patisgest-store.ts` (partiel) | 🟡 Floats ailleurs |
| Vitrine publique | **hors CDC** | 2 145 lignes | ⚠️ Hors périmètre |
| Architecture = Drizzle | Arch §3/§4 | supprimé | ❌ **Doc faux** |
| Tauri (pas Electron) | Arch §3 | Electron | ❌ |
| GitHub privé | Arch §3 | public | ❌ |

**Score : 15 conformes · 5 partiels · 8 manquants · 4 hors sujet.**

---

---

## 4 bis — Matrice de traçabilité à jour (`50509b7`)

| Exigence | Code | Statut réel |
|---|---|---|
| RC-01..RC-10 | `cost-sheet.ts` | ✅ |
| RC-09 FEFO multi-lots | `fefo-cost.ts` + parité SQL | ✅ |
| MOD-01 dashboard CA/marge/perte | `dashboard-insights.ts` | 🟡 marge/perte non consolidées |
| MOD-02 articles/lots/FEFO | complet | ✅ |
| MOD-03 achats + alerte 10 % | `price-alerts.ts` | ✅ |
| MOD-03 US-03.3 liste de courses | `liste-courses.ts` + panneau | ✅ |
| MOD-04 recettes/versionnage | complet | ✅ |
| MOD-05 OF snapshot/partiel | complet | ✅ |
| MOD-06 caisse + ticket 80 mm | complet | ✅ code / 🟡 papier non vu |
| MOD-06 US-06.4 avoirs | migration 41 + `AvoirForm` | ✅ |
| MOD-07 clôture 6 flux | `cloture-form.tsx` | ✅ sauf RG-07.2 |
| MOD-08 cake acompte 30 % | `patisgest-store.ts` | ✅ |
| MOD-09 HACCP | complet | ✅ |
| MOD-10 allergènes 14 | `allergenes.ts`, `label-maker.tsx` | ✅ |
| MOD-11 traçabilité/rappel | complet | ✅ |
| MOD-12 planning | `planning-forms.tsx` | 🟡 charge vs capacité : **fait** (11/11) → ✅ |
| MOD-13 simulation | complet | ✅ |
| MOD-14 multi-sites/transferts | complet + concurrence | ✅ |
| MOD-15 paramètres | `parametres` | ✅ |
| MOD-15 US-15.2 restauration | code oui | ⏸ **reporté (15 clients)** |
| MOD-15 §8.3 export comptable | `export-comptable.ts` + route + bouton | ✅ |
| NF-01 performance | mesuré 13 ms / 9 ms | ✅ |
| NF-02 hors-ligne (H2) | coquille D5 | 🟡 conçu, pas éprouvé en boutique |
| NF-05 18-07 (code) | migration 42 | ✅ |
| NF-05 DPA + région | région `eu-west-1` ✅ / DPA ❌ | 🟡 région conforme, DPA à signer |
| NF-06 ticket 80 mm | 7 tests | 🟡 papier non éprouvé |
| NF-07 parcours | 6 tests | 🟡 novices non testés |
| NF-08 tests RC | ✅ | ✅ |
| NF-09 restauration testée | — | ⏸ **reporté, daté** |
| NF-10 journal audit | migration 40 | ✅ code / ⏸ non appliqué en base |
| RI-05 décimal exact | `numeric(12,2)` | ✅ (doc corrigée) |
| Vitrine publique | 2 145 lignes | ⚠️ hors CDC, décision assumée |
| Architecture = Drizzle | supprimé | ✅ doc corrigée |
| Tauri (pas Electron) | Electron | ❌ **écart subsistant** |
| GitHub privé | public | ❌ **écart subsistant** |

**Score à jour : 20 conformes · 5 partiels · 2 manquants (DPA, Electron/GitHub privé) · 1 hors sujet · 2 reportés et datés.**

*(Le score de l'audit initial — 15 ✅ · 5 🟡 · 8 ❌ — reste dans §4 comme photographie
du point de départ. Il n'a pas été réécrit : c'est la comparaison qui a de la valeur,
pas le chiffre.)*

## 5. Ce qui reste — plan ordonné

Le CDC prévoit J1 = **MVP à S12** avec 5 pilotes en production. Le produit est fonctionnellement *au-delà* du MVP sur 12 modules, mais **bloqué** par trois choses qui ne sont pas des fonctionnalités : le hors-ligne, la restauration, l'audit. Voici l'ordre, et pourquoi cet ordre.

### Palier 1 — Débloquer la facturation (2 à 3 semaines)

Ce sont les seules tâches dont l'absence **empêche d'encaisser**. Rien d'autre ne doit passer avant.

| # | Tâche | Écart | Critère de fin (testable) |
|---|---|---|---|
| 1.1 | **Restauration prouvée** : exporter la base pilote, restaurer sur un projet Supabase isolé et jetable, comparer les comptes de lignes, les FK, les policies, les comptes Auth | B5, NF-09 | Un rapport de restauration daté, avec captures de comptage avant/après et un test de retour arrière. **Sans ça, pas de GO commercial.** |
| 1.2 | **Table `journal_audit` + triggers** sur ventes, mouvements, clôtures, OF, connexions | B1, NF-10, RI-06 | Trigger `insert-only`, RLS par `client_id`, test qui prouve qu'un `UPDATE`/`DELETE` sur le journal échoue. |
| 1.3 | **Isolation `D7`** : FK tenant-composites ou validation explicite du tenant avant tout `INSERT` en `SECURITY DEFINER` | NF-04, D7 | Suite adversariale 2 tenants : une restauration avec FK externe est **rejetée en entier**, pas partiellement. |
| 1.4 | **Fenêtres ouvertes** : `sites` UPDATE direct (D4), `clients.offre` (D9), vue publique `client_id` (D2), anti-abus global (D3b) | D2/D3b/D4/D9 | Test PostgREST réel par rôle, pas un test SQL textuel. |
| 1.5 | **Réconcilier le pilote** : vérifier que 33→39 sont appliquées, ou les appliquer après 1.1 | G | Le catalogue pilote == le dépôt, prouvé par une requête de contrôle. |

**Pourquoi 1.1 d'abord, avant même le hors-ligne :** parce qu'aucune ligne de code ne rend une donnée perdue récupérable. Avec des données de pilote réelles en base et zéro restauration prouvée, chaque jour qui passe est un risque non couvert, et ce risque est **irréversible**. Le reste est réversible.

**Et un point d'honnêteté :** tu as demandé à plusieurs reprises de reporter la restauration (NOTE-IMPORTANTE, PLAN-CLOTURE, décision « à 15 clients »). Ce report est **la** décision la plus coûteuse du projet, parce que c'est la seule qui ne se rattrape pas. 15 clients, c'est 15 fois plus de données non récupérables.

### Palier 2 — Livrer le hors-ligne promis (3 à 4 semaines)

Le bloc le plus lourd, et le seul que le pilote **verra** immédiatement.

| # | Tâche | Détail |
|---|---|---|
| 2.1 | **Conception isolée du cache hors-ligne** | Répondre d'abord à la question que `sw.js` pose : comment cacher du HTML authentifié sans le rendre lisible après changement de compte sur une tablette partagée ? Options : clé par appareil, purge au logout, cache par utilisateur avec namespace dans le nom de cache. **Décider avant de coder.** |
| 2.2 | **Réplication du catalogue en lecture** | `catalogue-cache.ts` → vrai miroir (articles, lots, prix, DLC) dans IndexedDB, rafraîchi à chaque synchro, horodaté et affiché (« catalogue du 23/11 08:12 »). |
| 2.3 | **Caisse complète hors-ligne** | Écran servi + catalogue lu localement + file d'écriture (déjà faite) → encaisser sans réseau de bout en bout. |
| 2.4 | **D5 reste du périmètre** | OF lancer/valider ✅ (file existe), T° et clôture **à ajouter** ; exports et suppressions **à bloquer** (bouton grisé + explication, comme le CDC le demande). |
| 2.5 | **Bouton état de synchro** (§6.4) | à jour / X en attente / erreur, + file limitée à 7 jours, + reprise exponentielle 1 min → 1 h. |
| 2.6 | **Test de bout en bout** | Le critère du Sprint 4 de la roadmap : « journée complète simulée sans internet puis synchronisée, 0 doublon ». Ce test doit exister en CI. |

**Ne saute pas 2.1.** C'est le piège que l'auteur précédent a correctement identifié et qu'un développeur pressé va ignorer. Le commentaire dans `sw.js` est un avertissement de sécurité, pas une note de TODO.

### Palier 3 — Fermer les trous du CDC *Must* (1 à 2 semaines)

| # | Tâche | Critère |
|---|---|---|
| 3.1 | **Restauration en 2 clics** (US-15.2) | Après 1.1, l'exposer dans l'UI. Sauvegarde → restauration sur base vide = données identiques. |
| 3.2 | **Export comptable** (§8.3) | `date, pièce, compte auxiliaire, HT, TVA, TTC` — faire **valider le format par un comptable** avant de l'écrire. C'est aussi l'étape 1 de ta propre checklist de démarrage. |
| 3.3 | **Avoirs/retours** (US-06.4) | Motif obligatoire, remise en stock **ou** destruction tracée. Table + RPC + écran. |
| 3.4 | **Liste de courses** (US-03.3) | `besoins OF planifiés − stock − en commande`, exposée. Le calcul existe déjà pour MOD-12. |
| 3.5 | **Charge vs capacité** (US-12.1, 480 min) | Somme des durées du jour vs capacité réglable, alerte non bloquante (RG-12.1). |

### Palier 4 — Réparer les documents (1 jour, à faire **maintenant**, pas après)

**C'est le meilleur rapport effort/impact de tout ce rapport.**

| Doc | Correction |
|---|---|
| `02-Architecture-Technique-v4.md` §3 et §4 | Retirer Drizzle. Écrire : « Accès données : `@supabase/supabase-js` + RPC. Migrations SQL manuelles dans `supabase/`, figées par SHA-256. **Ne pas générer le schéma depuis un ORM.** » |
| Architecture §3 | Tauri → « Electron en V1 (existant), Tauri en V4 » *ou* l'inverse de ce qui est décidé — mais **une seule version** |
| `01-CDC` §9 D1 | Remplacer la grille mensuelle par une grille **annuelle prépayée + installation** (cf. analyse pricing) et **séparer** les deux seuils : trésorerie (~9) et revenu fondateur (~35) |
| CDC §3 | **Ajouter MOD-16 « Vitrine publique »** avec ses exigences de sécurité (isolation, anti-abus, prix côté serveur), *ou* déclarer la vitrine hors périmètre V1 et geler les brouillons 125–127 |
| CDC §4.1 Arch | Ajouter le **code `MOD-xx` en commentaire d'en-tête** de chaque module (`[module]/page.tsx`, `cost-sheet.ts`…). 0 aujourd'hui. Coût : 20 minutes. Effet : la traçabilité devient mécanique au lieu d'être un audit de 3 heures. |
| Tous | Verrouiller une **matrice de traçabilité versionnée** dans `docs/traceabilite.md`, mise à jour à chaque PR. |

**Pourquoi tout de suite :** parce que ces documents sont la source d'erreur. Les trois agents du dossier Drive ont codé du Drizzle **parce que l'Architecture l'ordonne**. Corriger le document coûte 1 jour ; ne pas le corriger a déjà coûté trois livraisons inutilisables et va continuer à coûter.

### Palier 5 — Vérifier les non-fonctionnel (1 semaine, en parallèle du terrain)

> **Mis à jour le 23 novembre 2026.** 5.1 est fait (mesuré). 5.5 est écrit et
> versionné, non appliqué. 5.2, 5.3 et 5.4 restent ouverts et disposent maintenant
> d'un **protocole exécutable** : `PROTOCOLE-QUALIFICATION-MATERIELLE.md` — déroulé,
> relevé à remplir, et définition explicite de ce qui compte comme un échec.
> Formulation à conserver : ces tâches ne sont pas « en cours », elles sont
> **non commencées** et instrumentées.

| # | Tâche |
|---|---|
| 5.1 | ~~Mesurer NF-01~~ — **fait** : 400 lots en 13 ms, 700 ventes en 9 ms sur 18 000 ventes ; `lirePages` borné. |
| 5.2 | **Ouvert.** Test matériel NF-06 : tablette Android 9+, imprimante thermique 80 mm. Non négociable — aucun ticket n'a jamais été vu sur papier. Protocole §1. |
| 5.3 | **Ouvert.** Test NF-07 : 3 novices, chronométré (critère < 1 h). Protocole §2, avec la règle qui décide du résultat : aucune aide, et une seule personne en échec suffit à invalider l'exigence. |
| 5.4 | **Ouvert.** DPA + région d'hébergement (NF-05, loi 18-07) + mentions légales/CGU. **Juridique, pas code** — obligatoire avant V1 commerciale. Protocole §3, incluant le registre des traitements (souvent oublié, demandé en premier lors d'un contrôle). |
| 5.5 | Politique de mot de passe : **écrite et versionnée** (`patisgest-app/SECURITE-COMPTES.md`), **non appliquée**. 12 caractères, JWT 12 h, rotation, inscriptions fermées + procédure console + relevé daté (vide). Verrouillage après 5 essais : toujours non fait. |

### Palier 6 — Durcissement et sortie (Sprint 6 de la roadmap)

`CHECKLIST-60` (déjà 12/12 sur la matrice RLS), revue sécurité 25 points (`REVUE-SECURITE-25.md` existe), formation, procès-verbal d'acceptation.

---

## 6. Ce qu'il faut arrêter de faire

Une analyse honnête doit aussi dire ça.

1. **Arrêter d'ajouter des modules.** 12 sur 15 sont là. Le 13ᵉ ne vendra pas la 1ʳᵉ licence. Les trois manquants du *Must* coûtent 2 semaines ; un module *Could* de plus coûte 2 semaines aussi et n'apporte rien avant le premier client.

2. **Arrêter d'écrire hors spec.** La vitrine, c'est 2 145 lignes et 3 constats de sécurité ouverts, pour une fonctionnalité absente des trois documents. Si elle est stratégique, **écris-la au CDC avec ses exigences** ; sinon, gèle les brouillons 125–127 et ne touche plus au routage par hôte.

3. **Arrêter de reporter la restauration.** C'est la seule décision irréversible du projet. « À 15 clients » = 15 fois plus de données non récupérables. Palier 1.1, avant tout le reste.

4. **Arrêter de produire des documents stratégiques.** 38 fichiers `.md` pour 21 165 lignes de code. Le prochain document produit doit être une **matrice de traçabilité d'une page** (ce rapport), pas un 39ᵉ handoff. Un document qui ne se traduit pas en tâche testable est un document qui coûte du temps.

5. **Arrêter de faire coder la stratégie par trois agents en parallèle.** Le dossier Drive précédent : 3 applications, 0 compilable, 3 prix différents, tous basés sur une architecture périmée. Un agent, une tâche, un test.

---

## 7. Réponse à « quoi, quand, comment »

**Quoi, dans l'ordre :** restauration prouvée → journal d'audit → isolation D7 → fenêtres ouvertes → hors-ligne → trous *Must* → documents → non-fonctionnel.

**Quand :**

| Semaine | Contenu | Sortie mesurable |
|---|---|---|
| S1 | 1.1 restauration + 1.5 réconciliation pilote | Rapport de restauration daté |
| S2 | 1.2 journal audit + 1.3 isolation D7 | Tests adversariaux verts |
| S3 | 1.4 fenêtres ouvertes + **Palier 4 (documents, 1 j)** | Tests PostgREST par rôle verts + docs à jour |
| S4–S7 | 2.1 → 2.6 hors-ligne | « Journée sans réseau puis synchro, 0 doublon » en CI |
| S8–S9 | 3.1 → 3.5 trous *Must* | Checklist CDC *Must* à 100 % |
| S10 | 5.1 → 5.5 non-fonctionnel | Délais mesurés, matériel réel, juridique |
| S11–S12 | Palier 6 durcissement | PV d'acceptation signé |

**Comment savoir que c'est fini :** la matrice §4 passe de « 15 ✅ · 5 🟡 · 8 ❌ » à « 28 ✅ ». Chaque ligne ❌ doit avoir un **test** qui échoue aujourd'hui et passe après. Les tests sont la seule définition de « fait » qui résiste au temps — c'est d'ailleurs la règle que la roadmap a déjà écrite : *« l'IA propose, les tests RC/FEFO disposent »*.

---

## 8. Une dernière chose, et elle est plus importante que le reste

Le produit est **meilleur que ce que son README dit de lui**. 458 tests verts, RC-01..RC-10 conformes, FEFO avec test de parité SQL, 12 modules fonctionnels. Ce n'est pas un prototype : c'est un logiciel.

Et pourtant ce logiciel ne peut pas être vendu, pour trois raisons qui n'ont **rien à voir** avec ce qui a été codé :

- on ne sait pas restaurer ses données (**NF-09**) — **toujours vrai, et désormais
  reporté par choix** : c'est un arbitrage, pas une correction ;
- ~~il ne trace pas qui a fait quoi (**NF-10**)~~ — **corrigé** (migration 40) ;
- ~~il ne fonctionne pas quand le réseau tombe (**NF-02 / H2**)~~ — **corrigé sur le
  périmètre D5** : la coquille hors-ligne cloisonnée permet de rouvrir et d'encaisser.

Il reste donc, au 23 novembre 2026, **une** des trois raisons — et elle est assumée
plutôt que subie. Ce qui n'a pas changé : les trois preuves physiques (imprimante,
novices, DPA) sont toujours absentes, et aucun commit ne les produira.

Aucune de ces trois lignes n'est un module séduisant. Toutes les trois sont **écrites en gras dans ton propre cahier des charges**. Les 2 145 lignes de vitrine et les 38 documents stratégiques ont été produites à la place.

Le vrai écart entre ce que tu voulais et ce que tu as n'est donc pas un écart de fonctionnalités : c'est un écart de **priorité**. Le CDC a raison sur ce qu'il demande ; c'est le travail qui est allé ailleurs.

Trois semaines de travail sur le Palier 1 te donnent un produit vendable. Trois semaines de module supplémentaire te donnent un produit plus large et toujours pas vendable. C'est le seul arbitrage de ce rapport.
