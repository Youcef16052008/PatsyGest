# Payer moins, ou payer zéro — décision chiffrée

**19 novembre 2026.** Lecture complète du cahier des charges v4.0 (15 modules, 427 l.),
de l'architecture v4.0, de la roadmap, du code livré et **mesures sur le projet
Supabase réel**. Complète [`NOTE-HEBERGEMENT.md`](NOTE-HEBERGEMENT.md) : celle-ci
répond « combien coûte la prod », celle-ci répond « **combien puis-je ne PAS
payer** ».

---

## 1. Ce que le cahier des charges impose vraiment

Tout le reste en découle. Trois exigences tuent la plupart des pistes d'économie :

| Exigence | Référence | Conséquence directe |
|---|---|---|
| **Hors-ligne obligatoire**, 0 perte (H2, NF-02, D5) | §1.6, §6, §9 | Le serveur peut être lent ou absent 1 h ; la vente est locale. **La disponibilité serveur n'est pas critique** — mais la **convergence** doit être parfaite. |
| **Données UE ou DZ**, DPA signé (NF-05) | §6 | Hetzner (UE) ✔ · Supabase eu-west-1 ✔ · **Cloudflare D1 ✘** (pas de région UE garantie pour la base) |
| **Sauvegarde quotidienne, RPO 24 h, RTO 4 h** (NF-09) + **conservation 10 ans** (RI-06, NF-10) | §6, §4.2 | **Le seul poste non négociable.** Ce n'est pas du confort : c'est §6 de ton propre cahier des charges. |
| **Budget infra année 1 < 60 000 DA** (C1) | §1.6 | 60 000 DA/an ≈ **5 000 DA/mois max**. Vercel Pro + Supabase Pro = 11 000 DA/mois → **respecté seulement à partir de ~20 clients**, donc hors année 1. À corriger ou à assumer. |

**Correction importante au cahier des charges** : §4.3 annonce « 100 clients ≈ 5 Go,
largement dans l'offre de base Supabase ». Après mesures (une vente = **506 octets**,
un mouvement = **176 octets**), une année à 100 boutiques pèse **3 à 4 Go**. Le
chiffre du CDC est bon : c'est bien pour ça que la base n'est **pas** un argument de
passage au Pro. La sauvegarde, elle, l'est.

---

## 2. Les trois paliers, chiffrés

### Palier 1 — Pilote : **0 DA/mois** (0 à ~15 comptes)

| Poste | Choix | Coût |
|---|---|---|
| Base + Auth | Supabase **Free** (500 MB, 50 000 MAU, 1 GB fichiers) | 0 |
| Garde-veille (anti-pause) | **GitHub Actions**, 1 requête / 2 jours | 0 |
| Sauvegarde quotidienne | **GitHub Actions + pg_dump chiffré**, 30 jours d'historique | 0 |
| Archivage long (10 ans) | Cloudflare R2 (10 GB gratuits, egress 0 $) | 0 |
| App | Vercel Hobby | 0 ⚠️ **non commercial** |
| E-mails | Resend / Brevo (3 000/mois gratuits) via SMTP custom | 0 |
| Domaine | `patisgest.dz` — **déjà prévu** dans le CDC (check-list §10, action 3) | ~1 500–3 000 DA/an |

**Livré dans ce commit** : `.github/workflows/sauvegarde-free.yml`. Il comble
exactement les deux manques qui justifiaient le Pro (pause + zéro sauvegarde) :
garde-veille, `pg_dump -Fc`, **chiffrement AES-256** (le dump contient des salaires
et des tickets), vérification d'intégrité à chaque exécution, copie R2 hors GitHub.

**C'est un vrai 0 DA, pas un 0 DA fragile** — à deux conditions :
1. **Vercel Hobby n'autorise pas l'usage commercial.** Tant que tu ne factures
   rien (pilotes gratuits ou en test), c'est conforme. Dès la **première facture**,
   il faut basculer (palier 2). C'est une clause de licence, pas un quota.
2. **Restauration testée une fois par mois, 15 min.** Une sauvegarde jamais
   restaurée n'est pas une sauvegarde. Procédure dans le résumé du workflow et §10.

### Palier 2 — Premier client payant : **≈ 1 700 DA/mois**

| Poste | Choix | Coût |
|---|---|---|
| App | **Cloudflare Workers** (OpenNext) — **commercial autorisé sur le plan gratuit** | 0 |
| Base + Auth | Supabase Free + sauvegarde GitHub (comme palier 1) | 0 |
| E-mails | Resend / Brevo | 0 |
| Domaine | `patisgest.dz` | ~200 DA/mois lissé |

**Pourquoi Cloudflare et pas Vercel ici** : le plan gratuit Cloudflare **autorise
l'usage commercial** (la seule restriction de leur contrat porte sur le traitement
de données de carte bancaire — non concerné, SATIM est en V4). Vercel l'interdit.
À fonctionnalités égales, c'est la seule différence qui compte pour toi.

**Le coût réel de ce palier est du travail, pas de l'argent** : l'adaptateur
`@opennextjs/cloudflare` demande un build Webpack (`next build --webpack`, Turbopack
non supporté) et un bundle < 3 MiB compressé sur le plan gratuit. Ton app est
petite (7 dépendances, `next/image` déjà en `unoptimized`), donc c'est jouable —
mais c'est **1 à 2 jours**, à faire une seule fois. Vercel reste plus simple ;
c'est un arbitrage temps contre 4 900 DA/mois.

### Palier 3 — Le seuil où payer devient rationnel : **≈ 11 000 DA/mois**

À partir de **~15–20 clients payants**, soit ~50 000 DA de MRR : Supabase Pro
(25 $) + Vercel Pro (20 $). Ce n'est plus une question de volume (tu es à 3 % de
toutes les limites) mais de **risque** : le jour où un client appelle parce que son
export a échoué, tu ne veux pas être celui qui répare un workflow GitHub.

**Règle d'arrêt simple** : *payer dès que la maintenance de l'astuce coûte plus
d'une heure par mois.* À 2 900 DA le client, une heure de ton temps vaut plus que
tous les contournements réunis.

---

## 3. Ce qu'il ne faut PAS faire pour économiser

| Fausse économie | Pourquoi elle coûte plus cher |
|---|---|
| **Neon / Turso / D1 à la place de Supabase** | Aucune auth. Les **70 policies RLS** et **38 RPC `SECURITY DEFINER`** reposent sur `auth.uid()`. Réécriture complète du modèle de sécurité sur des données de paie et de caisse. |
| **Auto-héberger Postgres (VPS 5 $)** | Tu deviens DBA : montées de version, PITR, sauvegardes, astreinte. Sur des données financières, sans DBA, c'est le seul poste où l'économie est fausse. |
| **Hetzner CX23 seul (5 $) sans rien d'autre** | Il faut quand même la base managée. Total 6 400 DA — mieux que 11 000, mais **+4 à 8 h/mois** d'exploitation. Rentable seulement au-delà de 30 clients. |
| **Cloudflare Pro (20 $)** | Les 100 domaines clients sont inclus dès le plan **Free**. Pro n'apporte rien ici. |
| **Un domaine par client** | 100 `.com` ≈ 300 000 DA/an, trois fois le budget infra. Sous-domaine gratuit par défaut. |
| **Baisser la sauvegarde à 1×/semaine** | NF-09 exige RPO 24 h. Un jour de tickets perdu = un jour de caisse à reconstituer à la main. |
| **Garder Vercel Hobby en facturant** | Suspension possible. Le risque n'est pas proportionnel à ce que tu économises. |

---

## 4. Décision recommandée

```
Maintenant (0 pilote payant)     → Palier 1 : 0 DA + workflow de sauvegarde livré
1er client payant                → Palier 2 : migrer l'app sur Cloudflare Workers (~1 700 DA/mois)
~15-20 clients                   → Palier 3 : Supabase Pro + hébergeur Pro (11 000 DA/mois)
```

**Total année 1 réaliste** : ~2 000 (domaine) + 0 à 20 000 (paliers 1–2) =
**bien en dessous des 60 000 DA du CDC (C1)**. Le CDC devient donc respecté, alors
qu'en payant tout de suite il ne l'était pas.

**Ce qu'il faut faire dès cette semaine, sans rien payer** :
1. Ajouter les 4 secrets GitHub (`SUPABASE_DB_URL` en Session Pooler, `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `BACKUP_PASSPHRASE`) et lancer le workflow à la main.
2. **Restaurer ce dump sur une base de test** une fois. C'est le seul vrai test.
3. Vérifier le plafond de dépense si un jour un compte payant est ouvert.

---

## 5. Une incohérence à trancher (hors budget, mais bloquante)

Le cahier des charges promet un **hors-ligne obligatoire, 0 perte**, avec file
d'attente idempotente (NF-02, D5, §6.1). L'état réel du code :

- `public/` ne contient **aucun service worker ni manifest** : l'app n'est ni
  installable ni **chargeable** hors-ligne. C'est le défaut principal : sans SW,
  la tablette qui perd le réseau à 15 h ne peut plus ouvrir l'écran de caisse ;
- `navigator.onLine` ne sert qu'à **désactiver le bouton** de vente — donc à
  interdire la vente hors-ligne plutôt qu'à la différer ;
- les files existent **et sont utilisées** (`sale-queue.ts` alimente bien
  `sale-form.tsx`, idempotence par ticket déjà en place), mais la reprise est
  **manuelle** (« Reprenez la synchronisation ») et rien ne vide la file
  automatiquement au retour du réseau.

Livrer 5 pilotes dans une boutique d'Oran sans PWA réelle, c'est prendre le risque
R2 de ta propre roadmap (« coupures internet longues — forte ») sur la promesse
centrale du produit. **Coût : 0 DA**, uniquement du travail. À planifier avant le
premier pilote, pas après.
