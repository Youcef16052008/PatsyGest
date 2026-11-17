# Sprint 6 — Durcissement pilotes (S12)

> Objectif roadmap : check-list 60 cas, corrections, revue sécurité 25 points,
> mentions légales/CGU, formation 5 pilotes (1 h sur place + guide papier
> 2 pages).
> **Fini si :** 5 pilotes encaissent réellement pendant 1 semaine, 0 bug
> bloquant.

## Ce qui est automatisable a été fait

- [x] **Page mentions légales / CGU** (`/mentions-legales`) : TVA 19 %/9 %,
      conservation 10 ans (code de commerce), loi 18-07 sur les données
      personnelles, avertissement « pilote ». Aucune donnée réelle ne doit
      entrer tant que la revue n'est pas faite.
- [x] **Revue sécurité outillée** (`tests/securite.test.mjs`) : les invariants
      vérifiables automatiquement sont désormais testés plutôt que relus.
      Voir le détail ci-dessous.
- [x] **Durcissement RLS** (migration 17) : confidentialité des coûts par rôle,
      suppression d'une surcharge `creer_of` ouverte à `anon`, révocation des
      droits PUBLIC par défaut et de `rls_auto_enable()`.

## Invariants couverts par `tests/securite.test.mjs`

| Invariant | Pourquoi |
|---|---|
| Aucun secret (clé `service_role`, JWT, mot de passe) dans les fichiers suivis | fuite par commit |
| `.env*` ignorés par Git | fuite de configuration |
| Migration 17 présente **et** miroir SQL de chaque migration | rejouabilité |
| Aucune migration ne contient `grant … to anon` | surface publique |
| Les tables de coût exportables sont marquées `cout: true` | contrôle de rôle |
| `page.tsx` vérifie `canReadCosts` avant le module simulation | fuite d'UI |
| Les actions serveur de coûts vérifient le rôle | contournement de l'UI |

## Restant / validation humaine — NE PAS déclarer fait

- [ ] **Check-list 60 cas** : non exécutée. Elle suppose un navigateur réel,
      les 3 comptes pilotes et des allers-retours métier ; la sandbox n'a pas
      d'accès réseau vers `*.supabase.co` / `*.vercel.app`.
- [ ] **Revue sécurité 25 points** : seuls les invariants ci-dessus sont
      automatisés. La revue complète (menaces, deux tenants, IDs falsifiés,
      concurrence, sauvegardes/restauration) reste à conduire.
- [ ] **Mentions légales** : page rédigée à titre de **modèle** ; validation par
      le comptable conseil et l'avocat requise avant V1 commerciale (le cahier
      §5 le demande explicitement).
- [ ] **Formation 5 pilotes** : humaine, hors périmètre sandbox.
- [ ] **Critère de sortie S6** (« 5 pilotes encaissent 1 semaine, 0 bloquant ») :
      non atteint et non atteignable ici.
