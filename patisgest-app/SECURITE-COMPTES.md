# Politique de sécurité des comptes — PâtisGest

**Version : 1 · 23 novembre 2026 · propriétaire : Youcef**

Ce fichier existe parce que l'audit a relevé un écart précis : l'architecture v4.0
annonçait « mot de passe 12 caractères minimum, verrouillage après 5 essais,
sessions 12 h », et **aucun des trois n'était réglé**. Ce n'était pas un bug du code :
c'est un réglage du projet Supabase, qu'aucun fichier du dépôt ne portait.

Un réglage qui n'est écrit nulle part n'est pas un réglage : c'est une intention. Il est
donc versionné ici, avec sa procédure d'application et son moyen de vérification.

---

## 1. Ce qui doit être configuré

| Paramètre Supabase | Valeur cible | Pourquoi cette valeur |
|---|---|---|
| `minimum_password_length` | **12** | Exigé par le CDC §7. Au-delà des 8 caractères par défaut, qui sont insuffisants pour un compte qui commande et encaisse. |
| `password_requirements` | `lower_upper_letters_digits` | Empêche `motdepasse123`-style. Ne pas exiger de symboles : sur une tablette de comptoir, le clavier symboles est une source d'abandon. |
| Durée de session (JWT expiry) | **43200 s (12 h)** | Le CDC veut une journée de travail, pas une semaine. 12 h couvre l'amplitude d'une boutique sans laisser une session ouverte la nuit si l'appareil est volé. |
| `security_refresh_token_rotation` | activé | Un jeton volé ne reste pas valide indéfiniment. |
| `security_refresh_token_reuse_interval` | 10 s | Tolère deux onglets qui rafraîchissent en même temps sans casser la session (la caisse en a deux ouverts). |
| Inscriptions publiques (`disable_signup`) | **désactivé** | PâtisGest est vendu par client, pas en libre-service. Un compte ne doit pas pouvoir se créer seul. |

## 2. Procédure d'application

Console Supabase → projet de production → **Authentication → Providers / Settings** :

1. `Minimum password length` → **12**
2. `Password requirements` → cocher minuscules, majuscules, chiffres
3. `JWT expiry` → **43200**
4. `Refresh token rotation` → activé, `reuse interval` → 10
5. `Allow new users to sign up` → **désactivé**

Répéter sur le projet de préproduction. **Ne pas appliquer sur un projet partagé avec
d'autres tests** : la longueur minimale casserait leurs comptes de test.

## 3. Vérification (obligatoire après application)

```bash
# Doit afficher l'URL du projet attendu, puis les réglages.
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | jq
```

Contrôler dans la réponse :

| Champ | Valeur attendue |
|---|---|
| `external.email` | `true` |
| `disable_signup` | `true` |
| `mailer_autoconfirm` | `false` |

`minimum_password_length` **n'est pas exposé** par cet endpoint public (c'est
volontaire : ne pas révéler la politique à un attaquant). Il se vérifie donc
empiriquement sur l'environnement de préproduction : tenter une inscription avec
`abcdefghij` (10 caractères) → refus attendu ; avec `Abcdefgh1234` (12) → succès.

**Consigner le résultat** dans la section 5 ci-dessous, avec la date. Un réglage non
vérifié est un réglage supposé.

## 4. Ce que le code fait, lui

Le code ne peut pas imposer la longueur du mot de passe : `signInWithPassword` rejette
déjà les mauvais identifiants et l'inscription se fait hors application. En revanche, là
où le code est responsable, il doit l'être :

- **Aucune inscription en libre-service** dans l'application (aucun `signUp` dans `src/`).
  Les comptes sont créés par le propriétaire. C'est cohérent avec `disable_signup`.
- **Déconnexion qui efface tout** : `logout()` supprime le cookie de démo, appelle
  `signOut()`, puis purge **tous** les cookies `sb-*-auth-token`. Ce dernier point
  n'est pas décoratif : sur une tablette de comptoir partagée, un cookie oublié rend
  la session du vendeur précédent rejouable.
- **Le verrouillage après 5 essais** n'est pas implémenté côté code. Il relève de
  Supabase Auth (limitation de débit côté plateforme) et doit être vérifié en
  préproduction. Écrit ici pour ne pas laisser croire qu'il est fait.

## 5. Journal des vérifications

| Date | Environnement | Résultat | Par |
|---|---|---|---|
| _à remplir_ | _préproduction_ | | |

> Tant que cette table est vide, la politique de mot de passe est **configurée mais non
> vérifiée**, donc à considérer comme non fiable dans un audit.
