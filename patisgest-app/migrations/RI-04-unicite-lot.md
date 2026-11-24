# RI-04 — Unicité du numéro de lot : la question était mal posée

**Date :** 23 novembre 2026 · **Statut : tranchée et appliquée** · Migration 43

## La question posée

Le rapport consolidé laissait RI-04 ouverte : *faut-il rendre le numéro de lot unique
par établissement (`client_id`, `numero`) ?* Deux réponses plausibles, aucune tranchée.

## Pourquoi les deux réponses étaient fausses

J'ai vérifié le code avant de choisir, et la contrainte `unique (client_id, numero)`
**casserait une fonctionnalité livrée** : `transferer_article` (migration 08) crée, pour
chaque lot transféré, un **lot miroir sur le site d'arrivée portant le même numéro** :

```sql
insert into public.lots
  (client_id, article_id, site_id, ..., numero, ...)
values
  (v_client, p_article_id, p_to_site_id, ..., v_lot.numero, ...)
```

Ce n'est pas un bug : c'est la conception. Un transfert ne crée pas un nouveau lot, il
déplace le même lot. Le lot `LOT-101` doit rester `LOT-101` après transfert, sinon la
traçabilité amont (fournisseur → réception → transfert → vente) se coupe, et un rappel
produit ne peut plus remonter la chaîne. C'est l'exigence MOD-11.

Donc `(client_id, numero)` est **faux** : le transfert viole la contrainte par
construction. La question n'était pas « faut-il ajouter une unicité ? » mais « quelle
identité de lot est unique ? ».

## La réponse

**Un lot est unique par `(client_id, article_id, site_id, numero)`.**

- `client_id` : étanchéité entre établissements (RI-01).
- `article_id` : deux articles différents peuvent porter le même numéro de facture
  fournisseur sans se contredire.
- `site_id` : le miroir de transfert vit sur un site différent — c'est précisément ce
  qui distingue deux lignes légitimes du même lot.
- `numero` : le numéro du fournisseur, conservé tel quel.

Ce que la contrainte interdit vraiment, et c'est son but : **réceptionner deux fois le
même lot au même endroit**. C'est l'erreur qui arrive quand deux personnes saisissent
le même bon de livraison — et elle double le stock sans que personne ne s'en aperçoive.

## Pourquoi une clé partielle, et pas une contrainte pleine

Le miroir de transfert peut lui-même être re-transféré, puis re-transféré en retour :
on obtient deux lignes de même numéro sur le même site, avec des quantités
différentes, et c'est **correct** (deux arrivées successives du même lot). Une
contrainte stricte les refuserait et bloquerait un retour de marchandise.

La règle est donc :

- **réception directe** (`ref` sans préfixe `TR-`) : unique par
  `(client_id, article_id, site_id, numero)` ;
- **lot de transfert** (`ref` commençant par `TR-`) : exempté, puisque le miroir est
  voulu.

`receptionner_lot` (05) et `recevoir_commande` (10) écrivent `ref` = numéro de bon /
null ; `transferer_article` (08) écrit `ref` = `TR-XXXXXXXX`. Le schéma distingue donc
déjà les deux cas, sans nouvelle colonne.

## Vérifié en base avant d'écrire la migration

| Contrôle | Résultat |
|---|---|
| Doublons `(client_id, numero)` actuels | **aucun** (0 ligne) |
| Doublons `(client_id, article_id, site_id, numero)` à `ref` hors `TR-` | **aucun** |
| Transferts dans le jeu de données | 0 (table `transferts` vide) |

La contrainte peut donc être posée sans réparer de données.

## Ce que ça change pour l'utilisateur

Rien de visible, sauf une chose : saisir deux fois le même numéro de lot sur le même
site produit maintenant un message d'erreur clair au lieu d'un stock doublé en silence.
Le message doit dire **quoi faire** (« ce lot existe déjà sur ce site ; corrigez la
quantité du lot existant »), pas seulement « contrainte violée ».

## À faire côté application

`receptionner_lot` et `recevoir_commande` remonteront l'erreur PostgreSQL `23505`.
`sale-form` / `actions-stock` doivent la traduire en français lisible. Sans cela,
l'utilisateur verra une erreur technique — mieux que rien, mais pas suffisant.

**Statut : contrainte décidée et justifiée.** Son application en base est la migration
43 ; la traduction du message côté application reste à faire.

---

## Application — 23 novembre 2026

Migration `43-unicite-lot.sql` appliquée au pilote, `app_schema_version = 43`.

**Vérifié en base, dans les deux sens :**

| Cas | Attendu | Obtenu |
|---|---|---|
| Miroir de transfert : même numéro, autre site, `ref = 'TR-TEST1234'` | accepté | ✅ accepté (1 ligne créée puis annulée) |
| Double réception : même numéro, même site, `ref = 'BC-DOUBLON'` | refusé | ✅ `ERROR 23505 duplicate key value violates unique constraint` |

Index réellement posés :

```
CREATE UNIQUE INDEX lots_reception_unique ON public.lots USING btree
  (client_id, article_id, site_id, numero)
  WHERE ((ref IS NULL) OR (ref !~~ 'TR-%'::text))
CREATE INDEX lots_numero_idx ON public.lots USING btree (client_id, numero)
```

**Ce que le test a confirmé au passage** : les deux insertions étaient dans la même
transaction, et c'est bien la seconde qui a échoué. La distinction entre miroir de
transfert et double réception tient sur le seul critère prévu — le préfixe de `ref` —
sans colonne supplémentaire.

## Reste à faire côté application

Le refus remonte en `23505`. Aujourd'hui `receptionner_lot` et `recevoir_commande`
laissent filer l'erreur PostgreSQL ; l'utilisateur verra un message technique. Il faut
la traduire : *« Ce numéro de lot existe déjà pour cet article sur ce site. Corrigez la
quantité du lot existant plutôt que d'en créer un second. »*

Tant que ce n'est pas fait, la contrainte protège les données mais l'expérience reste
brutale. C'est un progrès sur le stock doublé en silence, pas encore une bonne
expérience.
