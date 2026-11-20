# Revue de code PâtisGest — audit ligne par ligne

**Dépôt :** `Youcef16052008/PatsyGest` · branche `arena/27fe0740-patsygest` · base `2fba72c`
**Périmètre :** `patisgest-app/` (Next.js 16.4.6 / React 19.2.6), 21 905 lignes TypeScript, 60+ migrations SQL, 55 fichiers de test.
**Date :** 2026-11-20

## Méthode et limites (à lire avant les constats)

Ce qui a **réellement été exécuté** dans cet environnement :

| Commande | Résultat |
|---|---|
| `npm ci` | 401 paquets, exit 0 |
| `npm test` | **366 / 366** (24,6 s) |
| `npm run typecheck` | propre |
| `npm run lint` | propre |
| `next build` | exit 0, 9,8 s, 14 routes |
| `npm audit --omit=dev` | **0 vulnérabilité** |
| PostgreSQL réel (PGlite) : rejeu intégral des migrations `01`→`23`, `25`→`31`, puis des brouillons `101`–`128` | exécuté, voir constats |
| Scripts Node ad hoc sur `src/lib/*.ts` (import direct via `--experimental-strip-types`) | exécuté |

Ce qui **n'a pas pu être exécuté**, et pourquoi cela compte ici :

- **Aucun test contre une instance Supabase vivante** : l'environnement n'a pas d'accès réseau vers `*.supabase.co`. Tous les constats marqués « SQL » ont été validés sur un PostgreSQL reconstruit à partir des migrations du dépôt, avec des rôles `anon` / `authenticated` / `service_role` simulés. Les rôles réels Supabase, les privilèges par défaut du projet et l'extension `auth` restent hors de portée : ce sont exactement les points où un écart avec la production est possible (voir F-08).
- **Aucun test end-to-end navigateur** : il n'y a pas de suite Playwright/Cypress dans le dépôt, et je n'en ai pas écrit. Les chemins UI sont tracés par lecture du code, pas par exécution.
- **Pas de test de charge** : les constats de performance sont des déductions sur le nombre de requêtes, pas des mesures.

**Convention des constats.** `CONFIRMÉ` = reproduit par exécution (script ou PGlite), sortie citée. `TRACÉ` = démontré par lecture exhaustive du code, sans exécution. `RISQUE` = hypothèse plausible non prouvée, explicitement signalée comme telle — jamais présentée comme un bug.

Deux affirmations initialement envisagées ont été **réfutées par mes propres tests** et ne figurent pas ci-dessous comme défauts : (a) une incohérence entre `sauvegarde.ts` et la RPC `restaurer_sauvegarde` sur la table `demandes_reassort` — la migration `21-prix-demain-panier.sql:1130` redéfinit bien la fonction avec cette table ; (b) une fuite `anon` vers `patisgest_mon_client` / `patisgest_mon_role` — la migration `29` ferme correctement `PUBLIC`, ce que j'ai vérifié en rejouant les 31 migrations (voir F-08 pour le vrai problème résiduel, qui est différent).

---

## 1. Synthèse exécutive

**Qualité générale : nettement au-dessus de la moyenne** de ce que l'on voit sur une application de gestion de cette taille. Les points qui frappent :

- La logique métier critique est **extraite en modules purs et testés** (`pos-cart.ts`, `cost-sheet.ts`, `fefo-cost.ts`, `reconciliation.ts`, `tomorrow-recipe-guard.ts`, `domaines.ts`) au lieu d'être noyée dans les composants.
- La **sécurité SQL est prise au sérieux** : `security definer` avec `set search_path = ''`, périmètre `client_id` vérifié explicitement dans chaque RPC (et pas seulement par la RLS), `revoke`/`grant` nommés, idempotence par ticket, `FOR UPDATE` sur la consommation FEFO.
- Les **erreurs sont traduites** par un point unique (`erreurs-db.ts`) et les échecs de lecture ne dégradent pas silencieusement en « 0 » (`lirePages` renvoie `null`, l'UI affiche une alerte).
- La **restauration de sauvegarde est défensive** : vérification d'appartenance au tenant, refus des lignes étrangères, réservée au propriétaire.

Aucune injection SQL, aucun `dangerouslySetInnerHTML`, aucun `eval`, aucun `child_process`, aucun secret commité. 0 vulnérabilité de dépendance en production.

**Est-ce sûr à livrer ? Non, pas en l'état.** Quatre défauts sont bloquants : deux touchent l'argent ou des données irrécupérables, deux produisent des chiffres faux. **Aucun des quatre ne déclenche d'alerte** — c'est leur point commun et leur vraie gravité :

| # | Constat | Sévérité | Preuve |
|---|---|---|---|
| **F-01** | Une vente à **0 DA** est encaissée et décrémente le stock sans le moindre signal | **Critique** | SQL confirmé (PGlite) |
| **F-02** | Un **seul doublon** dans une sauvegarde fait **jeter la table entière**, et l'UI annonce un succès | **Critique** | SQL confirmé (PGlite) |
| **F-03** | L'ordre FEFO JavaScript est **inversé par rapport aux RPC SQL** : le coût affiché ne correspond pas au coût réel | **Élevée** | Exécuté |
| **F-04** | Les dates du jour sont calculées en **UTC** alors que l'app est à Oran (UTC+1) : entre 00:00 et 01:00, « demain » devient « aujourd'hui » | **Élevée** | Exécuté |

Le reste est solide. Les constats ci-dessous sont classés par impact réel, pas par élégance de code ; plusieurs sont des « ceci est correct, ne le cassez pas » que j'ai vérifiés explicitement pour ne pas inventer de critique.

**Les quatre actions à faire avant toute mise en production**, dans l'ordre :

1. Refuser une ligne de panier à `prixHT <= 0` côté serveur (`pos-cart.ts` **et** la RPC `vendre_panier`) — F-01.
2. Remplacer le `insert … select from jsonb_populate_recordset` de `restaurer_sauvegarde` par un `on conflict do nothing` ligne à ligne, et ne plus jamais étiqueter « table déjà présente » une table partiellement restaurée — F-02.
3. Corriger le comparateur `sortFefo` sur `congele` (`a.congele !== b.congele ? (a.congele ? 1 : -1)`) — un seul caractère — F-03.
4. Remplacer `jourUTC()` par `jourLocal()` (`Africa/Algiers`) et propager aux ~20 composants — F-04.

---

## 2. Constats détaillés

### F-01 — Une vente à 0 DA est encaissée sans signal, et décrémente le stock

- **Sévérité :** Critique — **Confiance :** certaine (reproduit)
- **Catégorie :** Correction fonctionnelle / intégrité financière
- **Emplacement :** `src/lib/pos-cart.ts` (calcul du panier), `supabase/06-ventes-caisse-fefo.sql:103-111` (`vendre_article`), `supabase/21-prix-demain-panier.sql` (`vendre_panier`), `src/components/stock-write-forms.tsx:34`

**Preuve — côté TypeScript**

```
computeCartTotals([{qte:1, prixHT:0, tva:0}])
→ { valide: true, totalTTC: 0, prixIncomplet: false }
```

**Preuve — côté SQL (PGlite, migrations réelles, article à `pv_ht = 0`)**

```
vendre_panier(site, [{article, qte:2}], ticket, 'especes')
→ { duplicate: false, totalHT: 0, totalTTC: 0, missing: 0 }
   lots avant : 10  →  lots après : 8
```

Les deux couches sont d'accord : la vente passe, le ticket vaut 0 DA, et **le stock est réellement consommé**.

**Problème.** Le prix `0` est traité partout comme une valeur légitime, alors qu'il signifie en pratique « prix pas encore saisi ». Ce n'est pas un cas théorique :

- `supabase/03-sprint2-modules.sql:29` déclare `pv_ht numeric(12,2) not null default 0` — **aucune contrainte `check (pv_ht > 0)`**.
- `src/components/stock-write-forms.tsx:34` propose `defaultValue={0}` et `min={0}` : un article nouvellement créé part donc à 0 DA par défaut.
- `src/lib/stock-input.ts:84` valide `pv_ht` sur `[0, 10_000_000]`.

Le garde-fou existe ailleurs : `supabase/26-vitrine-publique.sql:237` fait `nullif(a.pv_ht, 0) as prix_ht` pour afficher « Prix sur demande » sur la vitrine. La règle « 0 = pas de prix » est donc **déjà connue du projet**, mais elle n'a jamais été reportée côté caisse.

**Impact.** Perte de chiffre d'affaires invisible. Un vendeur presse le bouton sur un produit dont le prix n'a pas été rempli, le ticket s'imprime/vaut 0 DA, le stock baisse, la clôture est équilibrée (0 attendu, 0 compté), et **rien dans l'application ne signale l'anomalie**. Sur un mois, cela fausse aussi le coût matière et la marge par produit. C'est le pire profil : une erreur de saisie qui devient une perte comptable silencieuse.

**Comment reproduire.**

1. Créer un article avec `pv_ht` laissé à 0 (défaut de l'UI).
2. Lui donner un lot avec `qte_rest = 10`.
3. Encaisser 2 unités en caisse.
4. Observer : vente enregistrée à 0,00 DA, lot passé à 8.

**Correctif recommandé** — minimal, aux deux frontières :

```ts
// src/lib/pos-cart.ts — dans la boucle de computeCartTotals
const prixConnu = typeof prixHT === "number" && Number.isFinite(prixHT) && prixHT > 0;
if (!prixConnu) prixIncomplet = true;   // et non : traiter 0 comme un prix
```

```sql
-- supabase/33-*.sql — défense en profondeur : le client ne doit pas être seul juge
alter table public.articles
  drop constraint if exists articles_pv_ht_positif;
alter table public.articles
  add constraint articles_pv_ht_positif check (pv_ht > 0);
```

Attention : la contrainte casserait les articles existants à 0. La migration doit d'abord lister ces lignes pour arbitrage manuel, puis être appliquée en trois temps (`not valid` → correction des données → `validate constraint`). C'est le point de coordination à ne pas rater.

**Exemple corrigé** (comportement attendu) :

```
computeCartTotals([{qte:1, prixHT:0, tva:0}])
→ { valide: false, totalTTC: null, prixIncomplet: true }
   UI : « Prix manquant sur « Éclair chocolat » — corrigez la fiche article. »
```

**Test de non-régression** (ajouté à `tests/pos-cart.test.mjs`) :

```js
test('un article à 0 DA bloque la vente au lieu d’encaisser 0', () => {
  const t = computeCartTotals([{ articleId: 'a', label: 'X', qte: 2, prixHT: 0, tva: 19 }]);
  assert.equal(t.valide, false);
  assert.equal(t.totalTTC, null);
  assert.equal(t.prixIncomplet, true);
});
```

Et côté SQL, un test PGlite qui attend `P0001` sur `vendre_panier` avec un article à `pv_ht = 0`.

---

### F-02 — Restauration de sauvegarde : un seul doublon fait perdre la table entière, et l'UI annonce un succès

- **Sévérité :** Critique — **Confiance :** certaine (reproduit)
- **Catégorie :** Correction fonctionnelle / perte de données / récupération après sinistre
- **Emplacement :** `supabase/21-prix-demain-panier.sql:1185-1240` (`restaurer_sauvegarde`), `src/lib/actions-restauration.ts:80-93`

**Preuve (PGlite, migrations réelles).** Sauvegarde contenant 3 fournisseurs, dont **un seul** existe déjà en base :

```
retour RPC  : {"ignore": {"fournisseurs": 3}, "insere": {}}
en base     : 1 fournisseur (attendu 3)
```

**Problème.** Le cœur de la boucle est :

```sql
begin
  insert into public.fournisseurs select r.* from jsonb_populate_recordset(null::public.fournisseurs, v_lignes) r;
  ...
exception when unique_violation then
  v_ignore := v_ignore || jsonb_build_object(v_tbl, jsonb_array_length(v_lignes));
end;
```

La granularité du `begin … exception` est **la table**, pas la ligne. L'`insert` est une instruction unique : dès qu'une ligne heurte une clé primaire, PostgreSQL annule **l'instruction complète**, donc les 2 lignes neuves qui l'accompagnaient n'ont jamais existé. Le handler enregistre ensuite la table comme « ignorée » en comptant **toutes** ses lignes.

**Le second défaut est pire que le premier.** `actions-restauration.ts:90-93` construit le message :

```ts
`Restauration terminée : ${total} ligne(s) réinsérée(s)` +
(ignorees.length > 0 ? ` · ${ignorees.length} table(s) déjà présente(s) ignorée(s) (${ignorees.join(", ")})` : ".")
```

Une table dont 2 lignes sur 3 étaient neuves est annoncée comme **« déjà présente — ignorée »**. L'opérateur qui restaure après un sinistre lit un message vert, ne vérifie pas, et découvre la perte plus tard.

**Impact.** C'est le scénario le plus grave possible pour une application de gestion : la restauration de sauvegarde est le dernier rempart. Ici elle **échoue partiellement en silence**, et le compteur affiché est faux dans les deux sens (le nombre de lignes est surévalué pour les tables ignorées, sous-évalué pour les tables insérées). Restaurer une sauvegarde dans une base qui n'est pas parfaitement vide est le cas normal, pas le cas limite : une restauration après incident sur une base recréée mais où la fiche `clients` a été ressaisie à la main suffit à déclencher le problème.

**Comment reproduire.**

1. Charger une sauvegarde valide dans une base contenant déjà une des lignes (par exemple après avoir relancé une restauration, ou ressaisi un fournisseur).
2. Confirmer la restauration.
3. Lire : les lignes neuves de cette table sont absentes, et le message parle de « table déjà présente ».

**Correctif recommandé** — granularité ligne, sans tout réécrire :

```sql
-- remplacer l'insert bloc + exception par un insert ligne à ligne idempotent
insert into public.fournisseurs
select r.* from jsonb_populate_recordset(null::public.fournisseurs, v_lignes) r
on conflict (id) do nothing;
get diagnostics v_n = row_count;
v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
-- lignes ignorées = total - insérées, et le retour doit porter les deux nombres
```

Si le `on conflict (id)` n'est pas applicable partout (certaines tables ont des uniques secondaires — `cakes_cle_vitrine_unique`, `sites_subdomain_unique`), la variante sûre est une boucle `for r in select * from jsonb_populate_recordset(...) loop begin insert ... ; exception when unique_violation then v_ignore_ligne := v_ignore_ligne + 1; end;` — plus lente, mais correcte et sans réécriture du schéma.

Et **côté UI**, ne jamais présenter une table partiellement restaurée comme intacte :

```ts
succes: `Restauration terminée : ${total} ligne(s) insérée(s)` +
  (ignoreesPartielles.length > 0
    ? ` · ATTENTION : ${ignoreesPartielles.map(i => `${i.table} ${i.ignorees}/${i.total}`).join(", ")} ligne(s) non restaurée(s) — vérifiez ces tables.`
    : ".")
```

**Test de non-régression** — le mien est dans `/tmp/review/zz-review-restore.test.mjs` (hors dépôt pour ne pas casser `npm test`) ; à porter dans `tests/restauration-doublons.test.mjs` :

```js
// 3 lignes dont 1 doublon → 3 lignes en base, ignore = 0 pour la table
const r = await db.query(`select public.restaurer_sauvegarde($1::jsonb) as res`, [dump]);
assert.equal(count('fournisseurs'), 3);
assert.equal(r.rows[0].res.ignore.fournisseurs ?? 0, 0);
```

---

### F-03 — L'ordre FEFO JavaScript est inversé par rapport aux RPC SQL

- **Sévérité :** Élevée — **Confiance :** certaine (exécuté)
- **Catégorie :** Correction fonctionnelle / coût matière faux
- **Emplacement :** `src/lib/fefo-cost.ts:50-62` (`sortFefo`), appelé par `actions-couts.ts:205`, `actions-simulation.ts:74`, `ingredient-impact.ts:303,425`

**Preuve.** Lots réels d'une pâtisserie : un frais (DLC 25/11/2026, 10 DA) et un congelé (DLC 01/06/2027, 12 DA).

```
JS  : congele → frais ... coût 60
SQL : frais → congele  ... coût 50
```

Sortie exacte de `computeFefoCost(lots, 5, '2026-11-20')` : `{"lignes":[{"lotId":"congele","qte":5,"pu":12}],"cout":60}`. Le SQL `order by l.congele asc` consomme le frais d'abord : 50 DA.

**Problème.** `sortFefo` fait :

```ts
if (a.congele !== b.congele) return a.congele ? -1 : 1;   // ← congelé EN PREMIER
```

Or **toutes les RPC SQL** qui consomment du stock écrivent `order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc` — `false` avant `true`, donc **le frais d'abord**. Les quatre boucles actives après la migration `21` sont :

```
21-prix-demain-panier.sql:451   vendre_panier       (et vendre_article, qui délègue)
21-prix-demain-panier.sql:607   demarrer_of
21-prix-demain-panier.sql:748   transferer_article
21-prix-demain-panier.sql:952   importer_z
```

Les boucles des migrations antérieures (`06:138`, `07:256`, `08:118`, `11:185`) portent le même ordre, mais elles sont **remplacées** par les `create or replace` de la `21` : ce sont les quatre lignes ci-dessus qui s'exécutent réellement. J'indique ce détail parce qu'il compte pour la correction : modifier `06`/`07`/`08`/`11` n'aurait aucun effet en production.

Le commentaire du fichier lui-même affirme l'inverse de ce qu'il fait — `fefo-cost.ts:50` : « Ordre FEFO identique au SQL : congelé d'abord ». Et **le magasin de démo est d'accord avec le SQL**, pas avec ce module : `patisgest-store.ts:36` fait `Number(a.congele)-Number(b.congele)`. Le module de coût est donc le seul des trois à diverger.

C'est un FEFO inversé au sens propre : le stock congelé (DLC longue) est consommé avant le stock frais (DLC courte), ce qui est exactement ce que le FEFO doit éviter.

**Impact.** Trois conséquences, dans l'ordre de gravité :

1. **Le coût affiché est faux** dès qu'un même article a des lots frais et congelés à prix différents — et l'écart peut être large, puisque les prix de congélation et d'achat frais diffèrent typiquement. Dans mon cas minimal : **+20 % de coût matière**, donc une marge surévaluée de 20 points.
2. Le **plan de production** (`actions-simulation.ts`) et l'**impact prix** (`ingredient-impact.ts`) héritent du même ordre.
3. Le consommateur réel (la RPC SQL) fait l'inverse du simulateur : **le prévisionnel ne décrit pas ce qui va se passer**. Le pire des deux mondes : le chiffre est faux *et* il est invérifiable à l'œil.

À noter que le test existant **verrouille l'erreur** : `tests/fefo-cost.test.mjs:20-25` s'appelle « congelé avant non congelé, même DLC » et attend `['f', 'n']`. Le corriger demande de corriger le test en même temps — c'est le signe d'une spécification mal comprise dès l'origine, pas d'une simple étourderie.

**Comment reproduire.**

```js
const lots = [
  { id:'frais',  qte_rest:5,  pu:10, dlc:'2026-11-25', date_reception:'2026-11-01', congele:false },
  { id:'congele',qte_rest:20, pu:12, dlc:'2027-06-01', date_reception:'2026-06-01', congele:true  },
];
computeFefoCost(lots, 5, '2026-11-20').lignes[0].lotId;  // 'congele' — le SQL prend 'frais'
```

**Correctif recommandé** — un signe :

```ts
// src/lib/fefo-cost.ts:53
if (a.congele !== b.congele) return a.congele ? 1 : -1;   // frais d'abord, comme le SQL
```

```js
// tests/fefo-cost.test.mjs:20
test('FEFO : non congelé avant congelé, même DLC (aligné sur les RPC SQL)', () => {
  const sorted = sortFefo([lot('n', { dlc:'2026-04-01', congele:false }),
                           lot('f', { dlc:'2026-04-01', congele:true })]);
  assert.deepEqual(sorted.map(l => l.id), ['n', 'f']);
});
```

**Test de non-régression** — un test qui compare le module au SQL, pas à lui-même : construire le même jeu de lots, faire tourner `sortFefo` et lire l'ordre d'un `order by` exécuté en PGlite, et exiger l'égalité. C'est le seul type de test qui aurait attrapé ce défaut.

---

### F-04 — Le « jour » est calculé en UTC alors que l'application sert Oran (UTC+1)

- **Sévérité :** Élevée — **Confiance :** certaine (exécuté)
- **Catégorie :** Correction fonctionnelle / frontière de date
- **Emplacement :** `src/lib/workspace-data.ts:16` (`jourUTC`), utilisée par `[module]/page.tsx:325` et `tomorrow-lab-server.ts:41` ; ~20 composants clients qui font `new Date().toISOString().slice(0,10)`

**Preuve.** Instant réel : 21 nov 2026, 00 h 30 à Oran (= 20 nov, 23 h 30 UTC).

```
réel (Oran)        : 2026-11-21
jourUTC()          : 2026-11-20
« demain au labo » : 2026-11-21   ← c'est aujourd'hui, pas demain
```

**Problème.** L'application est explicitement localisée Oran/Algérie (`Africa/Algiers`, DA, `en-CA` dans `tableau-de-bord/page.tsx:24`), et le tableau de bord fait correctement :

```ts
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", … }).format(new Date());
```

Mais **le reste de l'application ne suit pas cette règle**. `jourUTC()` est défini comme `new Date().toISOString().slice(0, 10)` — c'est-à-dire le jour **UTC**. La fenêtre de divergence est **00:00–00:59 heure locale d'Oran** (UTC+1 sans heure d'été), où le jour UTC est encore la veille. C'est une heure par jour, mais c'est précisément l'heure où un laboratoire de pâtisserie prépare sa journée.

Les composants concernés sont ceux qui **préremplissent une date de formulaire**, donc ceux qui écrivent en base :

```
src/components/cloture-form.tsx:65     date de clôture de caisse
src/components/quality-forms.tsx:12    relevés de température / nettoyages / non-conformités
src/components/planning-forms.tsx:11   tâches de planning
src/components/cake-forms.tsx:63       commandes cake design
src/components/of-forms.tsx            ordres de fabrication
src/components/commande-forms.tsx      bons de commande
src/components/z-import-form.tsx       imports Z
src/components/vitrine-commande.tsx    commandes vitrine
```

**Impact.** Trois effets distincts, tous silencieux :

1. **Clôture de caisse datée de la veille.** Une clôture saisie à 00 h 30 est enregistrée au jour précédent. La réconciliation (`reconciliation.ts`) compare alors les ventes du jour réel (datées `current_date` par le SQL, donc en heure serveur) à une clôture de la veille : écart fantôme, ou — pire — une vente réelle sans ligne de clôture, ce que `reconciliation` traite comme un manquant.
2. **« Demain au labo » affiche aujourd'hui.** `plusJours(jourUTC(), 1)` donne « le lendemain de la veille » = aujourd'hui. Le laboratoire prépare la mauvaise journée.
3. **Incohérence interne** : le tableau de bord et la clôture peuvent afficher deux « aujourd'hui » différents à la même minute.

Note : le serveur SQL, lui, utilise `current_date` (fuseau du serveur Supabase, généralement UTC). La cohérence n'est donc assurée nulle part de bout en bout.

**Comment reproduire.** Régler l'horloge système sur `2026-11-21T00:30:00+01:00` (ou simuler l'instant), ouvrir `/planning` : la date cible par défaut est `2026-11-21` alors que l'onglet s'appelle « Demain au labo ».

**Correctif recommandé** — une seule source de vérité, côté serveur :

```ts
// src/lib/workspace-data.ts
export const FUSEAU = "Africa/Algiers";
/** Jour civil de l'établissement (Oran), jamais le jour UTC. */
export function jourLocal(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
export const jourUTC = jourLocal;  // alias de transition, à supprimer
```

Pour les composants clients, la valeur doit venir du serveur en prop (`defaultDate={jourLocal()}`) plutôt que d'être recalculée dans le navigateur : la fonction pure ci-dessus est identique côté client, mais un seul point d'appel évite la récidive.

Le SQL mérite le même traitement : `current_date` devrait devenir `(now() at time zone 'Africa/Algiers')::date` dans les RPC qui datent une vente ou une clôture (`06:118`, `21:1108`).

**Test de non-régression :**

```js
test('jourLocal donne le jour d’Oran, pas le jour UTC', () => {
  const instant = new Date('2026-11-21T00:30:00+01:00');
  assert.equal(jourLocal(instant), '2026-11-21');
  assert.equal(instant.toISOString().slice(0, 10), '2026-11-20'); // ce que faisait jourUTC
});
```

---

### F-05 — Une sauvegarde partielle ou d'un ancien schéma échoue à la restauration (`23502`)

- **Sévérité :** Moyenne — **Confiance :** élevée (reproduit sur un dump incomplet)
- **Catégorie :** Données et API / compatibilité arrière
- **Emplacement :** `supabase/21-prix-demain-panier.sql:1185+`, `src/lib/sauvegarde.ts:19-20` (`VERSION_FORMAT = 1`)

**Preuve.** Un dump dont une ligne omet une colonne `NOT NULL` sans défaut produit :

```
null value in column "score" of relation "fournisseurs" violates not-null constraint
```

**Problème.** `insert into … select r.* from jsonb_populate_recordset(null::public.table, lignes)` remplit les colonnes absentes du JSON par `NULL` — **il n'applique pas les valeurs `DEFAULT` de la table**. Toute colonne `not null` ajoutée après la date de la sauvegarde et sans défaut rend la ligne impossible à insérer.

L'export actuel (`api/sauvegarde/route.ts`) fait `select("*")` et produit donc toutes les colonnes : le chemin nominal fonctionne. Le risque porte sur (a) un dump édité à la main, (b) un dump produit par une version antérieure du schéma, (c) une restauration partielle volontaire. Or `VERSION_FORMAT` vaut `1` et n'est **jamais comparé à quoi que ce soit** dans la RPC — un dump ancien est accepté sans contrôle de compatibilité, ce qui contredit le commentaire de `sauvegarde.ts:15-16` (« un dump d'il y a deux ans doit refuser de se restaurer dans un schéma qui a changé »).

**Impact.** Échec explicite (une exception, pas une corruption) : c'est le bon comportement en cas de refus, mais le message (`23502` brut) n'oriente pas l'opérateur. Le vrai danger est qu'il se produise **pendant** une restauration d'urgence, après que d'autres tables ont déjà été insérées.

**Correctif recommandé** — vérifier la version au tout début de la RPC :

```sql
if coalesce((p_dump->>'version')::int, 0) <> 1 then
  raise exception 'Sauvegarde de version % non prise en charge par ce schéma.', p_dump->>'version';
end if;
```

et, dans la boucle, insérer en nommant explicitement les colonnes attendues plutôt qu'en `select r.*`, ou rattraper `not_null_violation` avec un message par table.

**Test :** dumper `{"tables":[{"table":"fournisseurs","lignes":[{"id":…,"client_id":…,"nom":"X"}]}]}` → attendre `P0001` avec un message lisible, pas `23502`.

---

### F-06 — `computeFicheCout` lève une exception au lieu de retourner une erreur de champ

- **Sévérité :** Moyenne — **Confiance :** certaine (exécuté)
- **Catégorie :** Fiabilité / validation incohérente
- **Emplacement :** `src/lib/version-input.ts:87` (validation), `src/lib/cost-sheet.ts` (`rc05CoutParPortion`), via `computeFicheCout`

**Preuve.**

```
cuisson  90 %  → net=1      portion=100    total=100
cuisson  99 %  → net=0.1    portion=1000   total=100
cuisson  99.9 % → net=0.01  portion=10000  total=100
cuisson 100 %  → EXCEPTION: RC-05 rendement net : valeur attendue entre 0.0001 et 100000000.
```

**Problème.** `version-input.ts:87` valide `cuissonPertePct` sur `[0, 100]` **bornes incluses**, donc `100` est accepté. Mais `100 %` de perte donne un rendement net nul, que `rc05CoutParPortion` refuse ensuite en levant une exception. Il y a donc deux validateurs avec des bornes incompatibles : la saisie passe, le calcul explose.

Ce n'est pas limité à `100` : à `99,9 %` le coût par portion est multiplié par 10 000 (`net = 0,01`), ce qui est mathématiquement exact mais commercialement absurde — et l'UI l'accepte sans broncher.

**Impact.** Une exception non rattrapée dans un Server Action remonte en erreur Next générique (page d'erreur ou message technique), pas en message de formulaire. L'utilisateur ne sait pas quel champ corriger. Selon le point d'appel, cela peut aussi faire échouer toute une page de coûts plutôt qu'une seule fiche.

**Correctif recommandé :**

```ts
// version-input.ts:87 — borne haute exclusive
cuissonPertePct: num(formData.get("cuissonPertePct") ?? 0, "Perte cuisson", 0, 99.99),
```

et, à l'entrée de la fiche de coût, transformer l'exception en résultat typé (`{ ok:false, champ:'cuissonPertePct', message:'…' }`) que l'UI affiche sous le champ.

**Test :** `cuissonPertePct = 100` → `parseVersionInput` refuse avec un message de champ ; `99.9` → accepté et le coût affiché porte un avertissement.

---

### F-07 — Incohérence de la règle « 0 DA = prix sur demande » entre SQL et TypeScript

- **Sévérité :** Faible — **Confiance :** certaine (exécuté)
- **Catégorie :** Correction fonctionnelle / cohérence d'affichage
- **Emplacement :** `src/lib/vitrine-format.ts:22-26` (`libellePrix`), `supabase/26-vitrine-publique.sql:237`

**Preuve.**

```js
libellePrix({ prixHt: 0, unite: 'pcs' })  →  "0 DA / pcs"
```

Alors que la vue publique applique `nullif(a.pv_ht, 0) as prix_ht` et affiche « Prix sur demande ».

**Problème.** Le type `ArticlePrix` documente « `null` = prix non communiqué. Jamais 0 : « 0 DA » serait faux » (`vitrine-format.ts:12`). La règle est donc écrite… mais pas appliquée dans la fonction elle-même : elle dépend de l'appelant. Et l'appelant `parametres/page.tsx:159` la respecte (`Number(article.pv_ht) > 0 ? … : null`), tandis que la vitrine publique s'appuie sur le `nullif` SQL. Aujourd'hui tout est cohérent, **par coïncidence de deux implémentations séparées**.

**Impact.** Faible en pratique — c'est une fragilité, pas une fuite constatée. Le jour où un nouveau point d'appel passe `pv_ht` brut (ce qui est naturel, puisque c'est ce que renvoie Supabase), la vitrine affichera « 0 DA / pcs » alors que la règle métier est « Prix sur demande ». Même famille de cause que F-01.

**Correctif recommandé :**

```ts
export function libellePrix(article: ArticlePrix): string {
  const p = article.prixHt;
  if (p === null || p === undefined || !Number.isFinite(p) || p <= 0) return "Prix sur demande";
  …
}
```

**Test :** `libellePrix({prixHt: 0})` → `"Prix sur demande"` ; `libellePrix({prixHt: null})` → idem ; `libellePrix({prixHt: 260, unite:'pcs'})` → `"260 DA / pcs"`.

---

### F-08 — Les nouvelles RPC `security definer` sont ouvertes à `anon` par défaut

- **Sévérité :** Moyenne — **Confiance :** certaine (exécuté) — **catégorie :** sécurité / risque futur, pas une fuite actuelle
- **Catégorie :** Sécurité (défense en profondeur)
- **Emplacement :** `supabase/29-fermeture-public-fonctions.sql`, `tests/securite.test.mjs:65-80`

**Preuve.** Après rejeu des 31 migrations, l'état réel est **bon** :

```
anon execute => patisgest_demander_commande      (1 seule, SECURITY DEFINER, voulue)
```

Ensuite je crée une fonction `security definer` typique d'une future migration, sans `revoke` :

```sql
create or replace function public.patisgest_export_complet()
returns jsonb language sql security definer set search_path = ''
as $$ select jsonb_agg(u) from public.utilisateurs u $$;
```

```
anon peut exécuter la nouvelle fonction SECURITY DEFINER : true
```

**Problème.** `29` révoque `PUBLIC` **une fois**, sur les fonctions existantes. PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut sur **toute fonction nouvellement créée**, et le dépôt ne contient **aucun `alter default privileges`** (vérifié : zéro occurrence dans les 60+ fichiers SQL). Chaque future migration doit donc penser à son `revoke`, et rien ne le vérifie.

Le test `tests/securite.test.mjs` **donne une fausse assurance** : c'est une analyse de texte (regex sur les fichiers `.sql`), pas d'exécution. Il a d'ailleurs produit une alerte trompeuse pendant cette revue (détecté `grant execute … to authenticated, service_role` comme un grant à `anon` dans certains fichiers). Un lint textuel ne peut pas voir qu'une fonction créée ailleurs hérite de `PUBLIC`.

**Impact.** Aujourd'hui : nul, l'état est correct. Demain : une RPC `security definer` ajoutée sans `revoke` est joignable sans authentification — et `security definer` signifie qu'elle s'exécute avec les droits du propriétaire, donc la RLS ne la protège pas. C'est exactement le profil d'une fuite cross-tenant.

**Correctif recommandé** — rendre le défaut sûr plutôt que de compter sur la discipline :

```sql
-- migration 32
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant  execute on functions to authenticated, service_role;
```

**Test :** porter mon `zz-review-newfn.test.mjs` dans la suite permanente — créer une fonction après toutes les migrations, exiger `has_function_privilege('anon', …, 'execute') = false`.

---

### F-09 — `?apercu=…` invalide : erreur serveur au lieu d'un repli, et un point d'injection PostgREST latent

- **Sévérité :** Faible (le chemin n'est pas atteignable aujourd'hui) — **Confiance :** certaine sur le crash ; **RISQUE** sur l'injection
- **Catégorie :** Sécurité / robustesse
- **Emplacement :** `src/lib/workspace-read.ts:54,59`

**Preuve.**

```js
plusJours('pas-une-date', -6)  →  RangeError: Invalid time value
```

**Problème.** `lireProduction(db, clientId, sites, apercu, role)` n'a aucune validation de `apercu`. Il est passé à `plusJours` (qui lève `RangeError` sur une date invalide) **et** interpolé dans un filtre PostgREST :

```ts
select = select.or(`statut.in.(planifie,encours,partiel),date_prevue.gte.${plusJours(apercu, -6)}`);
```

Une valeur contenant `)`, `,` ou `.` permettrait d'ajouter des prédicats au filtre. Le `RangeError` protege partiellement (une valeur non-date échoue avant), mais un format comme `2026-11-21` est accepté et rien ne garantit que `plusJours` normalise la sortie.

**Ce qui sauve la situation aujourd'hui :** j'ai cherché tous les appels. Ils passent soit `today` calculé côté serveur, soit `undefined` :

```
tableau-de-bord/page.tsx:36,52   → today (serveur, Intl)
production-workspace.tsx:17      → undefined
[module]/page.tsx                → n'appelle pas lireProduction avec un paramètre utilisateur
```

Le paramètre `?demain=` de `[module]/page.tsx:325` est correctement validé par regex avant usage, et il alimente `lireDemainAuLabo`, pas `lireProduction`. **Il n'y a donc pas de faille exploitable aujourd'hui** ; c'est une dette qui deviendra une faille au premier branchement de `apercu` sur un paramètre d'URL.

**Correctif recommandé :**

```ts
export async function lireProduction(db, clientId, sites, apercu?: string, role = "proprietaire") {
  // même garde que [module]/page.tsx:325
  const dateValide = apercu && /^\d{4}-\d{2}-\d{2}$/.test(apercu) && !Number.isNaN(Date.parse(apercu))
    ? apercu : undefined;
  …
  if (dateValide) select = select.or(`statut.in.(planifie,encours,partiel),date_prevue.gte.${plusJours(dateValide, -6)}`);
```

**Test :** `lireProduction(…, '2026-99-99')` → pas d'exception, repli sur aujourd'hui. `apercu = '2026-11-21),id.neq.0'` → rejeté par la regex.

---

### F-10 — `reconciliation.ts` ignore les ventes à 0 DA

- **Sévérité :** Faible seule, **Moyenne combinée à F-01** — **Confiance :** TRACÉ
- **Catégorie :** Correction fonctionnelle / clôture de caisse
- **Emplacement :** `src/lib/reconciliation.ts:191`

```ts
if (!Number.isFinite(ttc) || ttc === 0) continue;
```

**Problème.** Ce `continue` exclut les ventes de valeur nulle du rapprochement. Couplé à F-01 — qui **produit** des ventes à 0 DA — cela signifie qu'une vente à 0 DA est non seulement encaissée, mais qu'elle est **invisible du contrôle de cohérence** : la clôture ne signalera jamais l'anomalie. Les deux défauts se renforcent.

**Impact.** Le filet de sécurité qui aurait pu détecter F-01 est neutralisé par la même hypothèse erronée (« 0 DA n'existe pas »).

**Correctif recommandé :** après F-01, ce cas ne devrait plus se produire ; garder le filtre mais **compter** ces lignes et les remonter en alerte plutôt qu'en silence :

```ts
if (!Number.isFinite(ttc)) continue;
if (ttc === 0) { ventesNulles.push(ligne); continue; }
// et exposer ventesNulles dans le résultat de réconciliation pour affichage
```

**Test :** une vente à 0 DA dans la période → `reconciliation().ventesNulles.length === 1`.

---

### F-11 — `db/index.ts` lève une exception au chargement du module

- **Sévérité :** Faible — **Confiance :** TRACÉ
- **Catégorie :** Maintenabilité / fiabilité
- **Emplacement :** `src/db/index.ts:11-14`

```ts
if (!connectionString) throw new Error("DATABASE_URL manquante. …");
```

**Problème.** Le module lève au niveau module. Aujourd'hui sans conséquence : **j'ai vérifié qu'il n'a aucun importateur** (`grep` sur tout `src/` : zéro). C'est du code mort avec un piège. Le jour où un script serveur l'importe, toute route qui traverse le graphe d'import échouera au build ou au runtime dans un environnement sans `DATABASE_URL` — y compris en CI, y compris pour un simple `import type`.

**Impact.** Nul aujourd'hui, piège à retardement. La documentation (`README`, section architecture) présente pourtant Drizzle comme la voie d'accès serveur directe, ce qui invite précisément à l'importer.

**Correctif recommandé :** soit supprimer `src/db/` (et `drizzle-orm`, `postgres` des dépendances — cela retire 2 paquets de la surface d'attaque), soit rendre l'initialisation paresseuse :

```ts
export function getDb() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL manquante côté serveur.");
  return drizzle(postgres(cs, { prepare: false }), { schema });
}
```

---

### F-12 — Le répertoire de migrations mélange l'historique et 28 brouillons marqués « NE PAS APPLIQUER »

- **Sévérité :** Moyenne (risque opérationnel) — **Confiance :** certaine
- **Catégorie :** Déploiement et exploitation
- **Emplacement :** `supabase/` (60+ fichiers), `tests/migrations-historique.mjs`

**Constat.** `migrations/repetition.json` déclare :

- **historique** : `01` → `23` (23 fichiers)
- **brouillons** : `101` → `128` (28 fichiers), dont `105-sites-lecture-brouillon.sql` et `107-tracabilite-sites-brouillon.sql` portent explicitement `NE PAS APPLIQUER` / `NE PAS DEPLOYER`
- et `24` → `31` n'apparaissent dans **aucune** des deux listes, alors qu'ils sont appliqués (la vitrine en dépend).

Un `for f in supabase/*.sql; do psql -f "$f"; done` naïf applique les brouillons **au milieu de l'historique** (tri lexicographique : `101` tombe entre `10` et `11`) et casse la base à mi-parcours. C'est précisément pourquoi `migrations-historique.mjs` avertit de « ne jamais trier le répertoire » — mais cet avertissement est un commentaire dans un fichier de test, pas une barrière technique.

**Preuve de fragilité (exécutée).** J'ai rejoué les 31 migrations puis tenté d'appliquer les brouillons par-dessus : le premier échoue immédiatement, et comme il ouvre une transaction, tous les suivants échouent en cascade.

```
(échec 101-confidentialite-labo.sql: policy "labo_sans_parametres_couts_insert"
        for table "parametres_couts" already exists)
(échec 102-cout-of-partiel.sql: current transaction is aborted, commands ignored …)
(échec 103-… : current transaction is aborted …)   ← et les 25 autres
```

Les brouillons ne sont donc pas idempotents même appliqués après coup, ce qui interdit aussi un `sort | xargs` naïf. Ils ne sont rejouables que dans un ordre choisi à la main — c'est-à-dire pas rejouables.

**Impact.** Risque de déploiement : une base à moitié migrée. C'est aggravé par un second problème, vérifié lui aussi : **`repetition.json` ne mentionne pas du tout `24`→`31`** (ni historique, ni brouillons). Un opérateur qui s'appuie sur ce fichier — c'est-à-dire sur la seule description machine-lisible du dépôt — **oubliera les index** (`24`), la vue publique (`26`), la fermeture `anon` (`28`/`29`) et les RPC vitrine (`30`/`31`). Or ce sont précisément les migrations qui portent la sécurité de la vitrine.

**Correctif recommandé :**

1. Déplacer les brouillons dans `supabase/brouillons/` — un glob `supabase/*.sql` ne les verra plus.
2. Remplacer `repetition.json` par une liste unique et ordonnée couvrant `01`→`31`, utilisée à la fois par les tests et par le déploiement.
3. Ajouter au CI `npm run typecheck && npm test && npm run lint` (déjà présents) **et** un job qui rejoue toutes les migrations dans l'ordre déclaré sur une base vierge — c'est ce que fait déjà `schema-complet.test.mjs`, donc l'ajouter au CI suffit.

**Test :** `assert.deepEqual(fichiersAppliques, fichiersDeploiement)` — la liste de déploiement doit être exactement la liste rejouée.

---

### F-13 — `parseCashDrawerDeclaration` ne distingue pas « champ vide » de « 0 saisi »

- **Sévérité :** Faible — **Confiance :** certaine (exécuté)
- **Emplacement :** `src/lib/closing-operations.ts`

**Preuve.** `parseCashDrawerDeclaration({ especesComptees: '0' })` renvoie des zéros sans distinction ; un écart de `-500` n'est pas signalé comme tel.

**Problème.** Le tiroir de caisse est l'endroit où « pas encore compté » et « compté, il y a zéro billet » doivent être distingués. Ici les deux produisent le même état, et un écart négatif important est une donnée, pas une erreur de saisie — l'UI devrait l'afficher comme un manquant à justifier, pas comme un zéro ordinaire.

**Impact.** Faible mais réel en comptabilité : la clôture peut enregistrer « 0 compté » alors que le caissier n'a rien saisi, ce qui produit un écart artificiel de tout le fond de caisse.

**Correctif recommandé :** garder `null` pour « non saisi » et ne calculer l'écart que si `especesComptees !== null`.

**Test :** `parseCashDrawerDeclaration({})` → `especesComptees: null` ; `({especesComptees:'0'})` → `0` avec `ecart = -fond`.

---

### F-14 — Injection CSV : un espace en tête contourne le garde-fou

- **Sévérité :** Faible — **Confiance :** certaine (exécuté)
- **Emplacement :** `src/lib/csv.ts:24,30`

**Preuve.**

```
"=1+1"    → "'=1+1"     protégé
" =1+1"   → " =1+1"     NON protégé
"\t=cmd"  → "'\t=cmd"   protégé
```

**Problème.** La regex `FORMULE = /^[=+\-@\t\r]/` est correcte, et le commentaire cite OWASP. Mais Excel et LibreOffice **ignorent un espace de tête** avant d'interpréter une formule : `" =1+1"` est évalué. Le contournement est trivial.

**Impact.** Faible : l'export CSV est réservé au propriétaire, et les données concernées sont saisies par l'équipe, pas par un visiteur de la vitrine. Le risque augmente si un jour un champ libre (nom de client vitrine, note de commande) se retrouve dans un export destiné à un tiers.

**Correctif recommandé :**

```ts
const FORMULE = /^\s*[=+\-@\t\r]/;      // tolère les espaces de tête
```

puis préfixer en conservant la valeur d'origine (`s = "'" + s`).

**Test :** `cellule(' =1+1')` → `"' =1+1"`.

---

### F-15 — Pagination silencieusement tronquée à 20 000 lignes

- **Sévérité :** Faible — **Confiance :** TRACÉ
- **Emplacement :** `src/lib/workspace-read.ts:13`, `api/export/route.ts:38`, `api/sauvegarde/route.ts:34`

**Problème.** `lirePages` boucle `for (let offset = 0; offset < 20000; offset += 500)` et renvoie `null` si la dernière page est pleine — c'est le bon comportement, l'échec est explicite pour les vues internes. Mais les deux exports font la même boucle avec des limites différentes (`20000` lignes pour le CSV, `50000` pour la sauvegarde) et renvoient une erreur 500 « limite atteinte ». Une pâtisserie qui dépasse 20 000 mouvements de stock ne peut donc plus exporter ses mouvements, sans indication du seuil dans l'interface.

**Impact.** Faible à court terme (20 000 mouvements représentent des années), mais c'est une limite dure non communiquée, sur une fonction présentée comme « aucune donnée prisonnière ».

**Correctif recommandé :** ajouter le seuil dans le message (« export limité à 20 000 lignes ; utilisez un filtre par période ») et, à terme, un filtre de date sur l'export des mouvements — la limite disparaît.

### F-16 — Un lot à `pu = 0` est invisible en coût sans être signalé

- **Sévérité :** Faible — **Confiance :** certaine (exécuté)
- **Emplacement :** `src/lib/fefo-cost.ts:86`

```
computeFefoCost([{qte_rest:100, pu:0, …}], 5)
→ { cout: 0, couvert: 0, insuffisant: true }
```

100 unités en stock, `couvert = 0` et `insuffisant = true`. Un lot sans prix connu est **sauté** (ligne 86), donc « insuffisant » — alors que le stock est là. Le compteur `insuffisant` est correct pour le **coût**, trompeur pour le **stock**. L'utilisateur lit « stock insuffisant » sur un article qu'il a en réserve.

**Correctif recommandé :** distinguer `insuffisantCout` de `insuffisantStock`, ou exposer `sansPrixConnu` (somme des quantités ignorées pour cause de `pu <= 0`). Ce sont deux informations différentes ; aujourd'hui elles partagent un seul booléen.

---

### F-17 — `computeFefoCost` accepte un `asOf` optionnel : sans lui, les lots périmés sont consommés

- **Sévérité :** Faible (latent) — **Confiance :** certaine (exécuté)
- **Emplacement :** `src/lib/fefo-cost.ts:69` (`asOf?: string`)

**Preuve.**

```js
computeFefoCost([{ dlc:'2026-01-01', qte_rest:5, pu:10, … }], 5)   // asOf omis
→ { couvert: 5, cout: 50 }     // un lot périmé est consommé
```

**Problème.** Le troisième paramètre est optionnel, et quand il est omis, le filtre de péremption (`ligne 82`) est désactivé. Comparer avec le SQL, où **chaque** RPC qui consomme des lots filtre explicitement :

```
21:450  vendre_panier        and (l.dlc is null or l.dlc >= current_date)
21:606  demarrer_of          and (l.dlc is null or l.dlc >= current_date)
21:749  transferer_article   and (l.dlc is null or l.dlc >= current_date)
21:953  importer_z           and (l.dlc is null or l.dlc >= p_date)
```

**Impact.** Nul aujourd'hui — j'ai vérifié les quatre points d'appel, et tous passent une date (`actions-couts.ts:205`, `actions-simulation.ts:74`, `ingredient-impact.ts:303` et `:425`). Le risque est une régression silencieuse : un futur appelant qui omet le paramètre obtient un coût qui inclut du stock périmé, sans aucun avertissement du type. Rendre le paramètre **obligatoire** est une correction d'une ligne qui supprime toute une classe de bugs.

**Correctif recommandé :**

```ts
export function computeFefoCost(lots: FefoLot[], qty: number, asOf: string): FefoResult {
  if (!DATE_ISO.test(asOf)) throw new Error("Date de simulation requise (AAAA-MM-JJ).");
```

**Test :** `computeFefoCost(lots, 5, undefined)` → lève ; `computeFefoCost(lots, 5, '2026-11-20')` avec un lot périmé → `perimeExclu: 5`.

---

### F-18 — Migration 27 : la RPC de commande publique échoue à l'exécution sur toute installation propre

- **Sévérité** : Haute (bloquant pour toute installation neuve ; à vérifier sur le pilote).
- **Découvert par** : rapport externe B, BUG-005 — **confirmé par reproduction**.
- **Preuve** : `supabase/27-commandes-vitrine.sql` sélectionne `s.id, s.client_id, s.nom` dans `v_site` (≈ l. 52), puis lit `v_site.subdomain` plus loin. Sur le chemin déployable `01–23` puis `25–31`, un appel anonyme à `patisgest_demander_commande('elyasmine', …)` renvoie : `record "v_site" has no field "subdomain"`.
- **Le correctif existe mais n'est pas appliqué** : le brouillon `127-vitrine-depot-schema-brouillon.sql` remplace `s.nom` par `s.subdomain` *dans le corps installé*, avec garde-fous. Il n'est pas dans le chemin déployable et il doit être réconcilié avec le pilote avant usage.
- **Correction** : corriger `27` elle-même (select `s.subdomain`, et `v_site.nom` si nécessaire) pour les nouvelles installations, puis fournir une migration de réconciliation séparée pour les bases déjà déployées. Ne pas laisser le brouillon `127` comme seule correction.
- **Test de non-régression** : test « chemin déployable seul » (01–23 + 25–31) qui publie une vitrine, soumet une commande et vérifie une ligne `cakes` `statut='demande'`. Ce test est exactement celui qui manque au `securite`/`schema-complet` actuel (cf. §4).

### F-19 — L'application interroge des vues `labo_*` / `vendeur_*` absentes du chemin déployable

- **Sévérité** : Haute pour les rôles `labo` et `vendeur` ; **couplage application/schéma non géré**.
- **Découvert par** : rapport externe B, BUG-001 — **confirmé**.
- **Preuve** : sur le chemin déployable `01–23` + `25–31`, `information_schema.views` ne contient **aucune** vue `labo_*` ni `vendeur_*` (seule `vitrine_catalogue` est ajoutée). Ces vues sont créées uniquement par les brouillons `101` (`labo_*`), `115` (`vendeur_lots`) et `116` (`vendeur_ordres_fabrication`), explicitement marqués « NE PAS DÉPLOYER ». Or le code les interroge pour les rôles correspondants : `workspace-read.ts` (`labo ? "labo_articles" : "articles"`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`), `(app)/[module]/page.tsx` (`labo_lots`, `labo_articles`, `vendeur_lots`), `lab-workspace.tsx` (`labo_cakes`, `labo_bons_commande`, `labo_recette_versions`, `labo_ventes_quantites`…), `stock-workspace.tsx`, `tomorrow-lab-private-server.ts`.
- **Conséquence** : un utilisateur `labo` ou `vendeur` sur une base au schéma `31` obtient une erreur « relation does not exist » sur les écrans stock, production et tableau de bord. Ce n'est pas un défaut isolé : c'est une incompatibilité de version. Le dépôt n'a aucun mécanisme (version de schéma, refus de démarrage) qui l'empêche.
- **Ce qui est vrai dans le rapport B** : la dépendance existe et le déploiement de `main` seul casse ces rôles. **Ce qui n'est pas démontré** : que des comptes `labo`/`vendeur` existent sur le pilote (non vérifiable depuis le dépôt).
- **Correction** : (1) ne déployer l'application qu'avec le schéma correspondant ; (2) table `app_schema_version` vérifiée au démarrage ; (3) décider explicitement si `101/115/116` sont retenues (et les réconcilier), ou si le code labo/vendeur est mis derrière un drapeau.
- **Test de non-régression** : matrice `app × schéma` (ancienne/nouvelle) avec un compte par rôle, appel des pages critiques.

### F-20 — Coût d'un OF partiellement produit compté plusieurs fois

- **Sévérité** : Haute (valorisation des stocks et marges).
- **Découvert par** : rapport externe B, BUG-004 — **confirmé par lecture de la formule, puis par l'arithmétique du code**.
- **Preuve** : `supabase/07-of-production.sql` (≈ l. 393–410, fonction `patisgest_terminer_of_interne`) calcule `v_per_unit := round(v_known / p_qte + v_overhead_unit, 2)`, où `v_known` = coût **total** des consommations enregistrées au lancement et `p_qte` = quantité de **ce** lot partiel. La ligne `cout_reel := cout_reel + round(v_per_unit * p_qte, 2)` vaut donc `v_known` **à chaque lot**. Exemple : 100 prévus, 1 000 DA consommés, lots 50 + 50 → 2 000 DA comptés au lieu de 1 000.
- **Le brouillon `102-cout-of-partiel.sql`** remplace le diviseur par `nullif(v_of.qte_prevue, 0)` : c'est la correction attendue. Il n'est **pas** dans le chemin déployable et ne corrige pas les OF déjà valorisés (à traiter à part, comme le dit le brouillon).
- **Test de non-régression** : un OF de 100 unités fini en 40 + 60 puis en 50 + 50 : la somme des coûts des lots produits doit égaler la consommation **une fois**, à l'arrondi près.

---

## 3. Ce qui est correct (et qu'il faut protéger)

Ces points ont été vérifiés un par un, souvent par exécution. Les mentionner évite qu'une reprise les « simplifie » par erreur.

- **`vendre_article` / `vendre_panier`** : idempotence par `(client_id, ticket)` avec `unique_violation` rattrapé **et** relecture de la vente existante ; `FOR UPDATE` sur les lots ; ordre FEFO conforme ; stock jamais négatif (un manque produit un mouvement `Vente sans stock` à quantité négative et un `manquants` explicite) ; perimètre tenant vérifié sur l'article **et** le site ; garde de rôle (`proprietaire`, `labo`, `vendeur`) ; bornes `0 < qte ≤ 1e8`, `ticket 1–80`. C'est du bon travail.
- **`saisir_cloture`** : refuse les quantités négatives, plafonne à 100 lignes, gère `revision`, plafonne les montants de caisse à 1e9, borne le motif à 160 caractères.
- **`patisgest_demander_commande`** : `security definer` + `set search_path = ''` ; un site non publié et un site inexistant donnent **le même message** (pas de fuite d'existence, commenté ligne 51) ; validation de la date (±365 j), du téléphone, des parts (1–10 000), de la note (≤500) ; idempotence par `cle_navigateur`.
- **`patisgest_reserver_sous_domaine`** : propriétaire uniquement, regex, ≥3 caractères, liste de noms réservés ; unicité globale par index partiel `lower(subdomain)` — vérifié, `sites_subdomain_unique` existe (`25:79`). Elle est bien globale et non par tenant, ce qui est le bon choix pour un nom DNS.
- **`tomorrow-recipe-guard.recettesPlanValides`** : profondeur ≤ 3, détection de cycle, parage borné 0–100, exclusivité article/sous-version, filtre sur les versions actives. C'est la fonction la plus délicate du dépôt et elle est écrite avec soin.
- **`actions-sites` / `actions-modules` / `actions-equipe`** : réservés au propriétaire via `clientProprietaire()`, portée client systématique. J'ai passé au crible tous les fichiers `"use server"` : aucun n'oublie son contrôle. Les cas qui *semblent* non protégés (`actions-rappel` `bloquerLotReal`, `quickDemoLogin`, `demanderCommande`) sont couverts par `writerContext()` ou publics par conception.
- **Exclusion des lots périmés dans les RPC de consommation** : j'ai vérifié les quatre boucles FEFO qui décrémentent réellement du stock (`21:450` `vendre_panier`, `21:606` `demarrer_of`, `21:749` `transferer_article`, `21:953` `importer_z`) — **toutes** filtrent `l.dlc is null or l.dlc >= current_date` (ou `p_date`), avec un commentaire explicite. Les versions antérieures de `07`/`08`/`11` ne l'avaient pas ; la migration `21` les redéfinit toutes et le dépôt est cohérent. C'est exactement le genre de détail qu'un audit rapide rate dans un sens **comme dans l'autre** — j'avais posé l'hypothèse inverse au second passage, et elle est fausse.
- **`price-alerts`** : garde `previous.pu > 0` avant de calculer une variation en pourcentage — évite la division par zéro et les alertes absurdes.
- **`erreurs-db.ts`** : traduit uniquement `P0001` (les messages métier voulus), laisse passer le reste ; le statut HTTP est le seul signal de reprise. Pas de fuite de détail SQL vers l'utilisateur.
- **`sw.js`** : ne cache **jamais** les navigations, le HTML ou l'API ; uniquement les assets statiques. C'est la bonne décision pour une application avec données par tenant.
- **`schema-complet.test.mjs`** (66 assertions) et `caisse-collision-db.test.mjs` (13 assertions) sont de vrais tests d'intégration : ils rejouent les migrations réelles sur PGlite. Ils ont d'ailleurs attrapé deux de mes propres erreurs de fixture pendant cette revue — c'est le signe qu'ils font leur travail.
- **Aucune surface d'injection HTML/JS** : zéro `dangerouslySetInnerHTML`, `eval`, `new Function`, `child_process`. Rendu React par défaut sur tout le dépôt.
- **`npm audit --omit=dev` : 0 vulnérabilité.** 32 paquets de production seulement. C'est rare et mérite d'être dit.

---

## 4. Couverture de test manquante

La suite existante est bonne sur la logique pure (366 assertions qui passent) mais elle est **aveugle sur quatre classes de défauts**, et les quatre défauts critiques de cette revue en font partie.

### 4.1 Aucun test ne compare le TypeScript au SQL

C'est la cause racine de F-03. `fefo-cost.test.mjs` teste `sortFefo` **contre lui-même** : il affirme « congelé d'abord » sans jamais confronter cette affirmation à `order by l.congele asc` des RPC. Le test passe, le code est faux.

> **Test manquant :** un test « miroir » qui, pour un jeu de lots donné, exécute le SQL en PGlite et le module TS, et exige le **même ordre** et le **même coût**.

Ce type de test manque pour : l'ordre FEFO, le calcul des totaux de panier, la règle « 0 DA = prix sur demande » (F-01, F-07), et la définition du « jour » (F-04).

### 4.2 Aucun test ne couvre la restauration sur une base non vide

Le chemin testé (`restauration-isolee.sh`, `verifier-restauration.mjs`) part d'une base vierge. C'est le cas facile. F-02 vit exactement dans le cas non testé : une sauvegarde restaurée **par-dessus** des données existantes.

> **Tests manquants :** restauration avec 1 doublon sur 3 lignes ; restauration rejouée deux fois (idempotence) ; restauration d'un dump amputé d'une colonne (`23502`) ; restauration d'un dump d'une autre version.

### 4.3 Aucun test de frontière temporelle

Rien ne teste `jourUTC` / `plusJours` à 23 h 30 UTC ou 00 h 30 locales. Les fonctions sont triviales, donc testées nulle part, et c'est exactement là que F-04 se cache.

> **Tests manquants :** `jourLocal(new Date('2026-11-21T00:30:00+01:00')) === '2026-11-21'` ; `plusJours` sur les années bissextiles et aux changements de mois.

### 4.4 Aucun test d'écriture financière à zéro

`pos-cart.test.mjs` couvre les quantités invalides, le panier vide, les prix négatifs — mais pas `prixHT = 0`, qui est pourtant la valeur **par défaut** du formulaire de création d'article.

### 4.5 Tests qui ne peuvent pas échouer

`tests/securite.test.mjs` est une analyse de texte par regex. Il fait correctement son travail de lint : il isole la liste des rôles (`to authenticated, service_role`) avant de chercher `anon`, donc il ne produit pas de faux positif — j'ai vérifié ce point, une alerte que j'avais crue erronée venait de mon propre script, pas du test. Sa limite est ailleurs, et elle est structurelle : il ne voit que les `grant` **écrits dans les fichiers**, jamais les privilèges **effectifs**. Il ne peut donc pas détecter qu'une fonction créée par une future migration hérite `EXECUTE` de `PUBLIC` (F-08). Il a sa valeur comme garde-fou de rédaction ; il ne remplace pas un test d'exécution.

### 4.6 Ce qui manque entièrement

- **E2E navigateur** : zéro. Aucun test ne vérifie qu'un clic sur « Encaisser » produit bien une vente, ou que le formulaire de clôture enregistre.
- **Tests de défaillance réseau** : `sale-queue.ts` et `catalogue-cache.ts` gèrent explicitement le hors-ligne, mais rien ne simule une coupure au milieu d'un envoi.
- **Tests de charge** : aucune mesure. Voir 4.7.
- **Tests de concurrence** : deux vendeurs sur le même lot, deux clôtures simultanées du même jour, deux réservations du même sous-domaine. Le SQL a les bons mécanismes (`FOR UPDATE`, index uniques) mais aucun test ne le prouve.

### 4.7 Performance (RISQUE, non mesuré)

Je n'ai pas fait de test de charge ; ces points sont des déductions sur le nombre de requêtes.

- `actions-couts.ts:194-206` : `Promise.all` sur **une requête par ingrédient** du besoin. Un OF de 12 ingrédients = 12 requêtes ; un lot de 40 OF = **480 requêtes** pour un affichage. Pas de N+1 au sens strict (c'est parallélisé), mais la latence est celle de la requête la plus lente et le pool Supabase encaisse 480 connexions logiques. Une requête `in (articleIds)` ramènerait cela à 1.
- `[module]/page.tsx:92-97` : sept requêtes `limit(…)` indépendantes, correctement parallélisées. Bon point.
- `limites silencieuses` : `limit(300)` sur les lots, `limit(500)` sur les journaux. Au-delà, l'écran **affiche un stock partiel sans le dire**. C'est le seul endroit où je rejoins une critique classique : un dépassement de limite doit être signalé, parce qu'un stock tronqué est indistinguable d'un stock réel.
- `lirePages` plafonne à 20 000 lignes avec échec explicite : correct.

---

## 5. Plan de test

### 5.1 Unitaires (logique pure) — à ajouter

| Cas | Entrée | Attendu |
|---|---|---|
| F-01 | `computeCartTotals([{qte:1, prixHT:0, tva:0}])` | `valide:false`, `totalTTC:null`, `prixIncomplet:true` |
| F-01 | `computeCartTotals([{qte:1, prixHT:null, tva:19}])` | `valide:false`, `prixIncomplet:true` |
| F-07 | `libellePrix({prixHt:0})` | `"Prix sur demande"` |
| F-03 | `sortFefo([frais, congele])` | frais d'abord |
| F-04 | `jourLocal(new Date('2026-11-21T00:30:00+01:00'))` | `"2026-11-21"` |
| F-04 | `plusJours('2028-02-28', 1)` | `"2028-02-29"` (bissextile) |
| F-14 | `cellule(' =1+1')` | `"' =1+1"` |
| F-06 | `computeFicheCout({cuissonPct:100})` | résultat typé `{ok:false, champ:'cuissonPertePct'}`, pas d'exception |
| F-13 | `parseCashDrawerDeclaration({})` | `especesComptees:null` |
| F-16 | `computeFefoCost([lot à pu:0], 5)` | `sansPrixConnu:5`, distinct de `insuffisant` |

### 5.2 Intégration SQL (PGlite, migrations réelles) — à ajouter

| Cas | Scénario | Attendu |
|---|---|---|
| F-01 | `vendre_panier` sur article `pv_ht=0` | `P0001` « prix manquant », stock **inchangé** |
| F-02 | Restaurer 3 lignes dont 1 doublon | 3 lignes en base, `ignore = 0` |
| F-02 | Rejouer la même restauration deux fois | 2ᵉ passage : 0 inséré, 3 ignorés, aucune exception |
| F-05 | Dump sans colonne `not null` | `P0001` « version/format non pris en charge » |
| F-08 | Créer une fonction après `29` | `has_function_privilege('anon', …, 'execute') = false` |
| Concurrence | Deux `vendre_article` sur le même lot, tickets différents | Le stock total décrémente exactement de la somme ; jamais de négatif |
| Concurrence | Deux `saisir_cloture` simultanées (même site, même date) | Deux révisions distinctes, pas de perte d'écriture |
| Idempotence | Même ticket rejoué | `duplicate:true`, même `sale_id`, stock **inchangé** |
| Sécurité | `vendre_article` sur un article d'un autre tenant | `P0001` « Article hors périmètre » |
| Sécurité | `restaurer_sauvegarde` par un `labo` | `P0001` « rôle non autorisé » |

### 5.3 E2E (manquant entièrement — priorité 2)

| Parcours | Attendu |
|---|---|
| Connexion → caisse → panier 2 produits → encaisser | Vente visible dans l'historique, stock décrémenté, ticket unique |
| Caisse hors-ligne (réseau coupé) → 3 ventes → réseau rétabli | 3 ventes synchronisées, aucune perte, aucun doublon |
| Clôture à 00 h 30 (horloge simulée) | Date = jour d'Oran |
| Sauvegarde → vider → restaurer | Données identiques (comparer les comptes par table) |
| Vitrine publique : commander depuis `slug.patisgest.dz` | Demande créée, visible côté équipe, `apercu` du site correct |
| Vendeur tente d'accéder `/parametres` | Refus (pas de fuite de données de coût) |

### 5.4 Sécurité (à automatiser, pas seulement documenter)

- `anon` sur chaque RPC : seule `patisgest_demander_commande` doit répondre.
- Un `vendeur` sur chaque table de coût : 0 ligne visible (`parametres_couts`, `recette_versions`, colonnes `pv_ht`).
- Cross-tenant : un utilisateur du client A ne lit ni n'écrit aucune ligne du client B, sur **chaque** table.
- Injection PostgREST : `?apercu=')` → rejet.
- CSV : `=`, `+`, `-`, `@`, `\t`, `\r` et **espace+`=`** → tous préfixés.

### 5.5 Reprise après sinistre (le plus important, et le moins couvert)

| Scénario | Attendu |
|---|---|
| Sauvegarde complète → base vierge → restauration | Comptes par table identiques à l'export |
| Sauvegarde → base partiellement repeuplée → restauration | Aucune ligne neuve perdue ; rapport honnête des lignes ignorées |
| Sauvegarde corrompue (JSON tronqué) | Refus net, **aucune** écriture partielle |
| Coupure pendant la restauration | Transaction annulée ; base dans son état initial |

### 5.6 Performance (à mesurer, pas à supposer)

- Fiche de coût d'un OF de 50 ingrédients : compter les requêtes (attendu ≤ 5 après correction du N+1).
- Tableau de bord avec 1000 articles / 5000 lots / 50 OF : temps de rendu serveur < 1 s.
- Export CSV de 20 000 lignes : < 10 s, mémoire stable.

---

## 6. Plan d'action priorisé

> Plan détaillé par phases, avec statut d'avancement : voir `revue/PLAN-CORRECTIF.md`. Phase 1 : F-01, F-02, F-03, F-18, F-20 faits (migrations 32–34, non appliquées au pilote) ; F-04 fait côté application (RPC SQL restantes) ; F-19 bloqué par une décision produit.

### À corriger avant toute mise en production (bloquant)

1. **F-01** — refuser `prixHT <= 0` dans `pos-cart.ts` **et** ajouter la contrainte + garde dans les RPC de vente. *Effort : ~2 h + une migration. Risque de régression : moyen (articles existants à 0 à traiter d'abord).*
2. **F-02** — restauration ligne à ligne idempotente + rapport honnête des lignes ignorées. *Effort : ~3 h. C'est le point le plus délicat, à tester sur une base non vide.*
3. **F-03** — inverser le comparateur `congele` + corriger le test qui verrouille l'erreur, + ajouter le test miroir SQL. *Effort : ~1 h. Un signe, mais le test à écrire est le vrai travail.*
4. **F-04** — `jourLocal()` avec `Africa/Algiers`, propagé aux ~20 composants par prop serveur, et `at time zone 'Africa/Algiers'` dans les RPC qui datent. *Effort : ~4 h, touche beaucoup de fichiers mais de façon mécanique.*

### Avant la prochaine version

5. **F-08** — `alter default privileges` (une migration de 3 lignes, protège toutes les suivantes).
6. **F-05** — contrôle de `version` dans `restaurer_sauvegarde` + messages d'erreur par table.
7. **F-06** — borner `cuissonPertePct` à 99,99 et rendre les erreurs de fiche typées.
8. **F-12** — déplacer les brouillons dans un sous-répertoire, une seule liste ordonnée `01→31` pour tests et déploiement.
9. **F-10** — remonter les ventes à 0 DA comme alerte au lieu de les ignorer (garde-fou de F-01).

### Amélioration ultérieure

10. **F-09** — valider `apercu` avant `plusJours` (5 lignes, à faire dès qu'un appelant s'en approche).
11. **F-07** — appliquer la règle « ≤ 0 » dans `libellePrix`.
12. **F-14** — `FORMULE = /^\s*[=+\-@\t\r]/`.
13. **F-13** — distinguer « non saisi » de « 0 » dans le tiroir.
14. **F-16** — séparer `insuffisantStock` de `insuffisantCout`.
15. **F-15** — filtre de période sur l'export des mouvements.
16. **F-11** — supprimer `src/db/` et les 2 dépendances mortes.
17. **F-17** — rendre `asOf` obligatoire dans `computeFefoCost` (une ligne, supprime une classe de régression).

### Optionnel

18. Ramener le N+1 de la fiche de coût à une requête `in (…)` (480 → 1).
19. Ajouter une suite Playwright minimale sur les 4 parcours de 5.3.
20. Remplacer le lint textuel de `securite.test.mjs` par les tests d'exécution de 5.4.
21. Ajouter un `error.tsx` par segment d'application — actuellement une exception non rattrapée dans un Server Action remonte en erreur Next générique.

---

## 7. Verdict final

**Pas sûr à livrer en l'état** — mais avec une nuance importante : **aucun défaut critique n'est de nature architecturale**. Les quatre bloquants sont des erreurs localisées et corrigeables en une à deux journées de travail :

- un comparateur inversé (un caractère),
- une règle « prix > 0 » non appliquée à la caisse,
- une granularité de transaction inadaptée dans une fonction de restauration,
- un fuseau horaire incohérent entre deux implémentations.

Ce qui est réellement en jeu n'est pas la qualité du code — elle est bonne, souvent très bonne — mais le fait que **ces défauts sont silencieux**. Une vente à 0 DA ne prévient personne, une table partiellement restaurée est annoncée comme intacte, un coût FEFO faux est présenté comme exact, une clôture du mauvais jour s'enregistre sans avertissement. Dans une application de gestion où l'utilisateur fait confiance aux chiffres affichés, le silence est la vraie gravité.

Deux recommandations de fond :

1. **Les tests doivent confronter le TypeScript au SQL**, pas seulement le TypeScript à lui-même. F-03 existe parce que `fefo-cost.test.mjs` affirme une règle au lieu de la comparer à la source de vérité. Un seul test miroir par module partagé (FEFO, panier, prix, dates) aurait attrapé **les quatre** bloquants.
2. **Aucune décision monétaire ne doit reposer sur une seule couche.** Aujourd'hui la règle « 0 DA = pas de prix » est connue de la vitrine (`nullif`), documentée dans `vitrine-format.ts`, et absente de la caisse. Trois implémentations, trois opinions. Le rempart doit être des deux côtés — application **et** base — parce que le SQL est le seul endroit où une autre application cliente ne peut pas la contourner.

**Après correction des points 1 à 4 et nouvelle passe de tests, cette application est livrable.** Elle est déjà plus solide que beaucoup d'applications en production. Le travail restant est de la finition sérieuse, pas une refonte.

---

*Revue réalisée sur la branche `arena/27fe0740-patsygest` (base `2fba72c`). Les scripts de reproduction sont conservés hors du dépôt dans `/tmp/review/` pour ne pas altérer la suite de tests ; `npm test` reste à 366/366 et la copie de travail est propre. Aucun fichier applicatif n'a été modifié.*

---

## 8. Analyse des rapports externes

Deux rapports d'autres agents ont été confrontés au code. Chaque affirmation conséquente a été classée : **confirmée** (reproduite par exécution, ou démontrée par lecture précise du code), **réfutée**, **exagérée** (le fait existe, la gravité ou le périmètre sont faux), **hors périmètre** (infrastructure, process, prototype HTML non web), **doublon** (couverte par un F-xx existant), ou **non vérifiée** (non reproductible depuis le dépôt ou la sandbox).

**Limite importante du rapport B** : il déclare lui-même n'avoir exécuté aucune commande. Ses niveaux « High / High » ne valent donc pas preuve ; seuls les points reproduits ci-dessous sont retenus.

### 8.1 Rapport B — « PâtisGest deep technical review » (14 points)

| ID B | Affirmation | Verdict | Preuve / commentaire |
|---|---|---|---|
| BUG-001 | Application et schéma pilote incompatibles (vues `labo_*`) | **Confirmé** → **F-19** | Aucune vue `labo_*`/`vendeur_*` sur le chemin déployable ; le code les interroge. Dépend de l'existence de comptes labo/vendeur (non vérifiable). |
| BUG-002 | Restauration : FK inter-tenants possibles | **Confirmé (lecture)**, reproduction de l'attaque non faite | `18` ne contrôle que `client_id` de chaque ligne ; aucune FK composite `(client_id, …)` dans les migrations (`grep foreign key (client_id` = vide). À reproduire avant correction. |
| BUG-003 | Doublon → toute la table ignorée | **Doublon de F-02** (confirmé) | Reproduit : 1 doublon + 2 nouvelles lignes → 3 ignorées. Le rapport a raison sur le mécanisme. |
| BUG-004 | Coût OF partiel compté plusieurs fois | **Confirmé** → **F-20** | `v_known / p_qte` à chaque lot ; `cout_reel += v_known` par lot partiel. |
| BUG-005 | Migration 27 : `v_site.subdomain` non sélectionné | **Confirmé (reproduit)** → **F-18** | `record "v_site" has no field "subdomain"` sur le chemin déployable. |
| BUG-006 | Replay de `vendre_panier` sans validation site/source/contenu | **Confirmé (lecture)** | La recherche d'idempotence ne porte que sur `(client_id, ticket)` et retourne avant toute validation (`21:340-384`). Le cas « collision dans le handler unique_violation » n'a pas été testé. |
| BUG-007 | Anti-abus vitrine : compteur global bloquant, courses | **Partiellement confirmé** | Le compteur 30/h est bien **par établissement** (`client_id`, tous les `cakes` vitrine) : un attaquant peut bloquer la vitrine. La course « même clé simultanée » est plausible (select puis insert avec index unique) mais **non reproduite**. |
| BUG-008 | Transfert sans idempotence, second RPC non transactionnel | **Confirmé (lecture)** | `transferer_article` n'a aucun `client_ref` (grep vide dans `21`). `actions-stock.ts` appelle `traiter_demandes_reassort` après coup, dans une requête distincte. Double transfert non reproduit. |
| BUG-009 | `.limit(100)` tronque silencieusement | **Confirmé, périmètre partiel** → doublon partiel de **F-15** | `[module]/page.tsx:165` : lecture générique `.limit(100)` sans tri stable ni indicateur. L'exemple « 101 gâteaux » n'est pas vérifié. |
| BUG-010 | CI liée à une seule branche, pas de gate sur `main` | **Confirmé, et pire** | `supabase-isole.yml` ne se déclenche que sur `push` vers `arena/28f0bb69-patsygest` et sur des chemins précis. **Aucun workflow du dépôt n'a de déclencheur `pull_request`** : aucun test n'est imposé avant merge. |
| BUG-011 | Dump AES-CBC non authentifié ; restauration non prouvée | **Confirmé en partie** | `sauvegarde-free.yml` utilise `openssl enc -aes-256-cbc -pbkdf2` (pas d'authentification, donc pas de détection d'altération). L'échec CI récent n'a pas été vérifié (historique GitHub non interrogé). Restauration non certifiée : confirmé par `PLAN-CLOTURE`. |
| BUG-012 | Import de sauvegarde du prototype HTML → XSS stockée | **Confirmé (validation faible), exploit non démontré** | `restoreFile` (`PâtisGest-Final.html:1337`) ne vérifie que `settings` et `articles` truthy. Injection effective non testée. Périmètre : prototype desktop, hors web app. |
| BUG-013 | Export CSV desktop vulnérable à l'injection de formules | **Confirmé** (`csvCell` l. 182 sans neutralisation `= + - @ TAB CR`) | Côté web, la neutralisation existe (cf. F-14 : contournement par espace initial). Le prototype HTML est à corriger ; périmètre hors web app. |
| BUG-014 | Electron 33 en fin de vie | **Confirmé** | `patisgest-desktop/package.json` : `"electron": "^33.0.0"`. Electron 33 : fin de support le 28/04/2025 ([endoflife.date](https://endoflife.date/electron)). Versions à viser à confirmer au moment de la migration. |

**Bilan Rapport B** : 9 confirmés (dont 3 nouveaux : F-18, F-19, F-20 ; 1 doublon de F-02 ; 1 doublon partiel de F-15), 2 confirmés en partie, 1 non vérifiable (échec CI), 0 réfuté. C'est le rapport le plus solide : il identifie des défauts réels que ma première passe n'avait pas couverts (F-18 à F-20), surtout la migration 27 et le coût d'OF partiel.

### 8.2 Rapport A — « Comprehensive Code Review & Security Analysis » (25 points)

| ID A | Affirmation | Verdict | Preuve / commentaire |
|---|---|---|---|
| BUG-001 | Conflits de numérotation 24–31 / drafts 101–128 | **Doublon de F-12**, gravité exagérée | Le conflit est réel. Il n'est pas « critique » : les migrations 25–31 se rejouent proprement sur 01–23 ; c'est l'ordre des brouillons qui casse. |
| BUG-002 | `schema.ts` : 7 colonnes `cakes` manquantes, `origine` défaut `'manuel'` | **Réfuté** | `schema.ts` contient les 7 colonnes (`tvaPct`, `paiements`, `cgvAcceptedAt`, `cgvVersion`, `versionId`, `qteFabrication`, `ofId`) ; `origine` vaut `'interne'`, avec un commentaire qui interdit `'manuel'`. Le HANDOFF décrit un état ancien. |
| BUG-003 | Migration 28 cosmétique sans 29 | **Réfuté (périmé)** → doublon partiel de **F-08** | `29-fermeture-public-fonctions.sql` existe. Le reliquat réel est F-08 : les fonctions créées après 29 héritent de `PUBLIC`, sans `alter default privileges`. |
| BUG-004 | DNS `*.patisgest.dz` jamais testé | **Hors périmètre (infra)** | Non vérifiable depuis le dépôt ni la sandbox. Le routage par hôte est testé unitairement. À traiter comme point de déploiement. |
| BUG-005 | Fuite de session via cache HTML hors ligne sur appareil partagé | **Exagéré** | `sw.js` ne met jamais en cache le HTML ni l'API (vérifié, cf. §3). Le risque réel est le cache catalogue en `localStorage` (voir BUG-023). Purge au déconnexion : non vérifiée. |
| BUG-006 | Production servant `f11e371` (pré-vitrine) | **Hors périmètre (ops)** | Vérifiable via le connecteur Vercel, non fait dans cette passe. À vérifier avant toute mise en production. |
| BUG-007 | File v1 non attribuée | **Non vérifié** | La citation de `PLAN-CLOTURE` est plausible ; la localisation `sale-queue.ts` est une supposition du rapport (« implied »). |
| BUG-008 | Prototype HTML sans authentification | **Hors périmètre** (conception) | Le README l'annonce comme outil autonome sans connexion. Non un défaut de l'application web. |
| BUG-009 | `esc()` ne protège pas l'apostrophe | **Confirmé (défaut), exploit non démontré** | `esc()` (`PâtisGest-Final.html:165`) n'échappe pas `'`. Le rapport note aussi que les attributs sont souvent en `"`. Non reproduit en contexte d'attribut à simple quote. |
| BUG-010 | Données en clair dans `localStorage` (prototype) | **Hors périmètre** (conception, documentée) | Le prototype stocke tout en `localStorage` par conception. Pour l'application web, voir BUG-023. |
| BUG-011 | Clé d'idempotence de repli collisionne | **Plausible, sévérité basse** | Le repli est `Date.now()-useId()`. `useId` peut être identique entre deux clients ; une collision exige la même milliseconde et le repli seulement hors contexte sécurisé. Le `Math.random()` proposé est un bon correctif, cheap. |
| BUG-012 | Le SW ne cache pas `/api/*` | **Réfuté comme bug** | C'est le comportement voulu et documenté. Le rapport le reconnaît lui-même. |
| BUG-013 | `execute_query` non transactionnel, mutations de test laissées | **Hors périmètre (process)** | Ne concerne pas le code livré. Leçon utile : j'ai moi-même pollué `tests/` avec des sondes, corrigé en les déplaçant hors suite. |
| BUG-014 | Codebase en français | **Hors périmètre** (choix assumé) | Non un défaut technique. |
| BUG-015 | Insertion directe `vitrine_photos` contourne le RPC | **Réfuté** | Table à RLS activée ; écriture réservée à `proprietaire` et `labo`, `client_id` contraint dans `using` et `with check`. Incohérence de style, pas de faille. |
| BUG-016 | Pas de limitation de débit applicative | **Confirmé, bas** | Aucune limitation dans `commander/actions.ts`. La limite SQL 30/h existe (cf. BUG-007 de B). |
| BUG-017 | `force-dynamic` sur la vitrine | **Confirmé comme choix, pas comme bug** | Commentaire explicite dans `page.tsx` ; le coût est assumé au volume actuel. Optimisation future. |
| BUG-018 | Messages d'erreur divulguent le schéma | **Non reproduit / largement réfuté** | `erreurs-db.ts` ne transmet le message brut que pour P0001 (testé dans `securite.test.mjs`). Les autres erreurs ne sont pas exposées ; un test de non-fuite plus large reste utile. |
| BUG-019 | Sandbox sans accès Supabase | **Hors périmètre (process)** | Limite de test réelle, déjà citée dans la section « Méthode et limites ». |
| BUG-020 | Sauvegarde et restauration non vérifiées | **Confirmé (documenté)** | `PLAN-CLOTURE` le dit explicitement. Même constat que B-011 ; c'est un gate de mise en production, pas un défaut de code. |
| BUG-021 | `next-env.d.ts` versionné, churn | **Confirmé** | `patisgest-app/next-env.d.ts` est suivi par git et non ignoré. Basse priorité. |
| BUG-022 | Desktop emballe le prototype HTML, pas l'app Next | **Confirmé** | `patisgest-desktop/package.json` : `"files": ["main.js", "../PâtisGest-Final.html"]`. |
| BUG-023 | Cache catalogue en `localStorage` non chiffré | **Confirmé (stockage clair)** | `catalogue-cache.ts` écrit en clair via `setItem`. Le contenu exact (NIF, RC) n'a pas été vérifié ; le chiffrement client n'apporte pas grand-chose face à un appareil compromis : le mieux est de réduire le contenu. |
| BUG-024 | `guardCheck` utilise un prix de référence obsolète | **Hors périmètre** (prototype) | Non vérifié dans l'app web. |
| BUG-025 | Drizzle sans clés étrangères | **Réfuté** | `schema.ts` contient 40 `.references(() => …)`. Les FK existent aussi dans les migrations. |

**Bilan Rapport A** (25 points) : **4 réfutés** (BUG-002, 012, 015, 025) ; **1 périmé** (BUG-003, le reliquat réel est F-08) ; **1 doublon** de F-12 avec gravité exagérée (BUG-001) ; **8 hors périmètre** (infrastructure, process, prototype HTML ou choix assumé : 004, 006, 008, 010, 013, 014, 019, 024) ; **6 confirmés** (016, 017 comme choix, 020, 021, 022, 023) ; **1 exagéré** (005) ; **1 plausible à faible impact** (011) ; **1 non reproduit** (018) ; **1 non vérifié** (007) ; **1 confirmé en partie** (009, défaut réel sans exploit démontré). Le constat le plus gros du rapport (BUG-002, « schéma incomplet ») est faux ; les points sérieux (migration 27, couplage schéma) viennent du rapport B.

### 8.3 Conséquences pour cette revue

- **Trois nouveaux constats** : F-18 (migration 27 cassée sur installation propre, reproduite), F-19 (couplage application/schéma, confirmé), F-20 (coût d'OF partiel, confirmé par formule).
- **Ajout au plan d'action** : F-18 rejoint les bloquants (corriger `27` et réconcilier, avant toute nouvelle installation). F-19 est bloquant pour tout déploiement de `main` sur un schéma non réconcilié. F-20 est à corriger avant la prochaine clôture d'OF partiel.
- **Gate CI** : aucun workflow ne s'exécute sur `pull_request` (vérifié). C'est plus grave que ce que dit le rapport B : tout ce que j'ai validé en local (366 tests) n'est imposé par aucune automatisation du dépôt.
- **Ce qui ne change pas** : les quatre bloquants F-01 à F-04 restent les plus sûrs, car je les ai reproduits. Les points réfutés (B-002 de A, B-015, B-025) ne doivent pas figurer dans une liste de correctifs.
- **Reste non vérifié** : DNS et version de production (ops, connecteur Vercel disponible), échec CI récent (historique GitHub), ampleur réelle des comptes labo/vendeur sur le pilote, exploitation de l'XSS du prototype.
