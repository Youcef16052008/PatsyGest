# PâtisGest App — Sprint 1 : Socle ✅

Connexion + 3 rôles (propriétaire / labo / vendeur) + isolement client + tableau de bord.
Prochain : Sprint 2 (articles, lots FEFO, achats).

## Mise en route (30–45 min, 10 étapes)

### A. Comptes gratuits (10 min)

1. **GitHub** : crée un dépôt privé `patisgest-app` et pousse ce dossier.
2. **Supabase** (https://supabase.com) : New project → nom `patisgest` → mot de passe
   base **fort** (note-le) → région Europe (Frankfurt) → Create.
3. **Vercel** (https://vercel.com) : Add New Project → importe le dépôt GitHub
   (ne déploie pas encore, on le fait à l'étape 10).

### B. Base de données (10 min)

4. Dans Supabase : **SQL Editor** → colle le contenu de `supabase/01-socle.sql` → Run
   (crée `clients`, `utilisateurs`, `sites` + sécurité RLS).
5. Dans Supabase : **Authentication → Users → Add user** → e-mail + mot de passe du pilote
   → Create. **Copie son UID** (colonne UID).
6. Dans **SQL Editor** : ouvre `supabase/02-seed-pilote.sql`, remplace
   `REMPLACE-MOI-PAR-UID-AUTH` par l'UID + le nom/e-mail de la boutique → Run.
7. Vérifie : **Table Editor** → `clients` (1 ligne), `sites` (2 lignes),
   `utilisateurs` (1 ligne, rôle `proprietaire`).

### C. Lancement local (10 min)

8. Ici : `cp .env.example .env.local` puis remplis avec
   Supabase → **Project Settings → API** (URL + anon key + service role)
   et **Database → Connection string → Pooler** (remplace le mot de passe).
9. `npm install` puis `npm run dev` → ouvre http://localhost:3000
   → connecte-toi avec l'e-mail / mot de passe de l'étape 5. 🎉

### D. Mise en ligne (10 min)

10. Dans Vercel : projet → **Settings → Environment Variables** → ajoute les 4 mêmes
    variables → **Deployments → Redeploy**. Teste l'adresse en ligne + déconnexion.
    **Sprint 1 terminé quand le pilote se connecte à l'adresse en ligne.**

## Structure

```
src/app/page.tsx                        → aiguillage connexion / dashboard
src/app/(auth)/connexion/               → page de connexion (FR)
src/app/(app)/tableau-de-bord/          → dashboard socle (client, rôle, sites)
src/lib/supabase/{client,server}.ts     → clients Supabase (navigateur / serveur)
src/lib/auth.ts                         → session : user + client_id + rôle
src/lib/actions-auth.ts                 → connexion / déconnexion
src/db/schema.ts                        → tables Drizzle (miroir du SQL)
supabase/01-socle.sql                   → tables + RLS (à exécuter 1 fois)
supabase/02-seed-pilote.sql             → client + sites + utilisateur pilote
middleware.ts                           → rafraîchit la session Supabase
```

## Règles d'or (rappel architecture)

- **Isolement** : les lectures passent par le client Supabase serveur → la RLS
  (`client_id`) s'applique automatiquement. Ne JAMAIS filtrer côté navigateur seul.
- **Rôles** : `proprietaire` (tout) / `labo` (stocks, prod) / `vendeur` (caisse + lecture).
- **Argent** : Sprint 2+ → montants en centimes (entiers), jamais de flottants.
- **Migrations** : Sprint 1 = SQL exécuté à la main ; dès Sprint 2, `npm run db:generate`
  + revue du SQL avant application.

## Commandes

| Commande | Usage |
|---|---|
| `npm run dev` | Développement local |
| `npm run build` / `npm start` | Build + production locale |
| `npm run typecheck` / `npm run lint` | Qualité (à lancer avant chaque commit) |
| `npm run db:studio` | Explorer la base (nécessite DATABASE_URL) |
