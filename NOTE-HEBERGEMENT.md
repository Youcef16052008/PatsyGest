# Note d'hébergement et de coûts — PâtisGest

**Date : 19 novembre 2026.** Réponse à l'analyse « Supabase Free ne suffit pas »
produite par un autre assistant. Chiffres d'usage **mesurés sur le projet réel**
`evepzygucfxarpdnflzv` (eu-west-1), limites fournisseurs **vérifiées en novembre 2026**.

---

## 1. Verdict

**La conclusion est bonne, le raisonnement est faux sur presque tous les points.**

Oui, il faut passer à Supabase **Pro** — mais pas à cause du stockage, de la RAM
ni des connexions. Les deux raisons qui suffisent, et qui n'apparaissent pas dans
l'analyse citée :

1. **Un projet Free est mis en pause après 7 jours sans requête.** Une caisse qui
   ne s'ouvre pas le lundi matin parce que la pâtisserie était fermée une semaine,
   c'est un client perdu. La reprise exige une action manuelle dans le tableau de bord.
2. **Aucune sauvegarde automatique sur Free.** Le produit contient des tickets,
   des clôtures de caisse et des coûts de revient. Une base Free corrompue est
   irrécupérable, et la sauvegarde maison ne suffira pas (voir §5, point 3).

**Et il manque un poste entier à l'analyse : Vercel.** Le plan Hobby est
**interdit à l'usage commercial** — le projet est aujourd'hui sur Hobby alors qu'il
est vendu. C'est un risque de suspension, pas une question de quota. Pro = 20 $/mois.

---

## 2. Confrontation point par point

| Affirmation de l'analyse | Réalité mesurée / vérifiée | Verdict |
|---|---|---|
| « 1 000 à 2 500 photos dépassent 1 GB » | **0 fichier, 0 bucket** dans Storage. Aucun écran n'uploade de photo : `articles` n'a **pas de colonne photo**, la démo sert des `.webp` statiques du bundle. La fonctionnalité n'existe pas. | **Spéculatif** |
| « Egress 5 GB épuisé en quelques jours par les 50 sites e-commerce » | Aucun site e-commerce dans le dépôt : pas de table catalogue public, pas de commande en ligne. Le site vitrine est un projet séparé. | **Spéculatif** |
| « Base 500 MB : risque moyen terme » | Base entière : **13 MB**, dont **1 064 kB** pour le schéma `public`. Une vente pèse **506 octets** mesurés, un mouvement **176 octets**. À l'échelle du pilote (1 client, 2 sites) on est à **2,6 %** de la limite. | **Exact mais pas maintenant** |
| « 500 MB RAM / CPU partagé → lenteurs, déconnexions avec 100 caisses » | Faux. Auth et PostgREST sont sans état : une vente = une RPC courte et transactionnelle. Limites réelles de l'instance : **60 connexions directes / 200 via pooler** — jamais atteintes par des caisses qui envoient une requête au clic. L'app n'utilise **aucun Realtime** (`supabase.channel()` absent du code). | **Faux** |
| « Pas de sauvegardes → critique » | Exact, et c'est le meilleur argument du lot. | **Exact** |
| « 50 comptes × 1 000 DA = 50 000 DA » | Le tarif du projet est **Solo 2 900 / Pro 5 900 / Groupe 9 900 DA** (Roadmap §6). À 50 comptes Solo : **145 000 DA MRR**, soit 2,9× l'hypothèse. La marge est meilleure qu'annoncée. | **Sous-estimé** |
| « Coût Pro = 25 $ ≈ 5 500–6 000 DA » | Il manque Vercel. **Supabase Pro 25 $ + Vercel Pro 20 $ = 45 $** ≈ **11 000 DA/mois** au parallèle (~245 DA/$). Toujours < 8 % du MRR à 50 clients. | **Incomplet** |
| « R2 pour les images, WebP < 150 Ko, RLS multi-tenant » | Les trois conseils sont bons **pour plus tard**. R2 (10 GB gratuits, egress 0 $) n'est pas rentable face aux 100 GB inclus dans Pro. La RLS par `client_id` est déjà en place : **25/25 tables, 70 policies**, mesuré. | **Déjà fait / prématuré** |

---

## 3. Ce que l'analyse a complètement oublié

| Risque | Effet réel | Parade |
|---|---|---|
| **Pause après 7 jours d'inactivité** | Caisse indisponible, réactivation manuelle | Pro (jamais mis en pause) |
| **Vercel Hobby = non commercial** | Suspension possible du déploiement vendu | Vercel Pro 20 $/mois |
| **SMTP intégré : 2 e-mails/heure, et uniquement vers les membres de l'organisation** | Impossible d'envoyer 50 invitations ou 50 réinitialisations de mot de passe. **Ce n'est pas une limite de plan : même Pro est bloqué.** | SMTP custom (Brevo/Resend, offre gratuite) + domaine + SPF/DKIM |
| **Réponse d'une fonction Vercel plafonnée à 4,5 MB** | Voir §5 : la sauvegarde JSON et l'export CSV casseront en 413 | Réponse en flux, ou export paginé |

---

## 4. Budget par étape (DZD, taux parallèle de novembre 2026)

| Étape | Clients | Infra | Coût/mois | MRR | Charge infra |
|---|---|---|---|---|---|
| **Pilote** | 1–5 | Supabase Free + Vercel Hobby | **0 DA** | 0 à 7 250 DA (pilotes −50 %) | — |
| **Premiers payants** | 5–15 | Supabase Free + Vercel Pro + SMTP gratuit | **≈ 4 900 DA** | 14 500 à 43 500 DA | 11–34 % |
| **Commercial (le seuil à ne pas rater)** | 15+ | **Supabase Pro + Vercel Pro** | **≈ 11 000 DA** | ≥ 43 500 DA | ≤ 25 % |
| **50 clients** | 50 | idem | ≈ 11 000 DA | 145 000 DA | **7,6 %** |

Notes de facturation Supabase Pro : 8 GB de base par projet inclus puis
0,125 $/GB **provisionné** ; 100 GB de stockage puis 0,0213 $/GB ; 250 GB
d'egress puis 0,09 $/GB ; 10 $ de crédit compute (couvre une instance Micro,
1 GB de RAM). **Activer le plafond de dépense** : c'est le seul garde-fou contre
une facture surprise.

**Croissance de la base, honnêtement chiffrée.** Au régime cible
(100 boutiques × 50 tickets/jour × 365 j) : 1,8 M tickets/an à ~1 kB avec lignes
JSON, plus ~1,3 GB de mouvements FEFO, plus index → **3 à 4 GB/an**. Les 8 GB du
plan Pro couvrent donc **environ deux ans** à pleine charge, et l'extension coûte
quelques dinars par GB. Le pilote, lui, tournerait 10 ans sous 500 MB : la base
n'est **pas** le point de rupture, c'est la sauvegarde qui l'est.

---

## 5. Actions d'ingénierie, par ordre de rentabilité

1. **Supabase Pro + Vercel Pro, maintenant que le premier client paie.** Pas une
   question de volume : de disponibilité et de sauvegarde. Coût ≈ 11 000 DA/mois.
2. **SMTP custom avant le 2ᵉ client.** Sans cela, la fonction « inviter un
   utilisateur » échoue en silence au-delà de 2 e-mails par heure.
3. **Sauvegarde maison à réparer — défaut réel, mesurable.** `GET /api/sauvegarde`
   sérialise **tout** l'établissement dans une seule réponse non diffusée. Dès
   qu'un établissement dépasse ~4,5 MB, Vercel renvoie `413 FUNCTION_PAYLOAD_TOO_LARGE`
   et l'artisan perd son seul export (RG-15.1 « aucune donnée prisonnière »).
   L'export CSV a le même défaut (`limit(20000)` par table). Correctif :
   répondre en **flux** (les réponses diffusées échappent à la limite) et/ou
   paginer par exercice. À faire avant la 2ᵉ année d'un client, pas avant.
4. **Photos : upload direct vers le stockage, jamais via une fonction.** La limite
   de 4,5 MB du corps de requête est infrastructurelle et non modifiable. Le jour
   où l'on ajoute les photos produits : URL présignée, compression WebP côté
   client (≤ 150 kB), `cache-control` long. R2 seulement si l'egress des vitrines
   dépasse les 250 GB inclus — pas avant.
5. **Index par tenant.** Les requêtes filtrent `client_id` puis trient par date.
   Seul `ventes (client_id, ticket)` était indexé. Au pilote c'est invisible ;
   à 100 boutiques dans une même table, chaque écran devient un balayage complet.
   Préparé dans `patisgest-app/supabase/24-index-exploitation.sql`.

---

## 6. Ce qui n'a pas besoin d'être acheté

- **Team Supabase (599 $)** : aucune fonctionnalité utilisée.
- **Compute plus gros** : Micro suffit très largement au profil d'usage (RPC courtes,
  pas de Realtime, pas d'analytique lourde).
- **Cloudflare R2** : à garder en réserve. Aucune image n'est servie aujourd'hui.
- **Multi-projets Supabase** : un seul projet, `client_id` + RLS, comme déjà fait.
  2 projets actifs suffisent (production + recette).

---

## 7. Sources

| Sujet | Référence |
|---|---|
| Limites Free/Pro, pause 7 jours, backups, 1 GB / 500 MB / 5+5 GB | [Supabase — Free Plan Limits 2026](https://freecloudzone.com/articles/supabase-free-tier-limits-2026/), [PutThrough — Supabase pricing 2026](https://www.putthrough.com/blog/supabase-pricing) |
| Connexions 60 directes / 200 pooler, Micro 1 GB | [Supabase — Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) |
| SMTP intégré : 2 e-mails/h, membres de l'organisation seulement | [Supabase — email rate limit](https://aliteq.com/supabase-email-rate-limit-exceeded) |
| Vercel Hobby non commercial, Pro 20 $/siège, 1 TB | [Vercel pricing 2026](https://www.stork.ai/blog/vercel-pricing-2026) |
| Vercel : 4,5 MB par requête/réponse, réponses en flux exemptées | [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) |
| R2 : 10 GB gratuits, egress 0 $ | [Cloudflare R2 pricing](https://egresscost.com/cloudflare/) |
| Taux parallèle : ~243–246 DA/$ | [Algérie 360, 4 nov. 2026](https://www.algerie360.com/taux-change-dollar-euro-dinar-4-novembre-2026/) |

---

## 8. Ce qui a été modifié dans le dépôt

| Fichier | Nature |
|---|---|
| `patisgest-app/supabase/24-index-exploitation.sql` | **Nouveau.** 14 index composites par tenant, idempotents. Non appliqués à la base pilote (qui est en migration 23) : à exécuter avant la montée en charge. |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.md` §8 | Tableau d'hébergement corrigé (Vercel non commercial, pause, SMTP, coût 45 $). |
| `NOTE-HEBERGEMENT.md` | Ce document. |
