# Politique de sécurité des comptes — PâtisGest

**Version : 2 · 23 novembre 2026 · propriétaire : Youcef**

> **Mise à jour du 23 novembre.** La configuration réelle du projet pilote a été lue
> pour la première fois (connecteur Supabase, `get_auth_config`). Elle était **plus
> faible que ce que ce document supposait** : `password_min_length = 6`, `jwt_exp = 3600`
> (1 h), `disable_signup = false`. Deux des trois réglages ont été corrigés ; le
> troisième ne doit pas l'être à l'aveugle. Voir §5.

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
| `password_min_length` | **12** | Exigé par le CDC §7. Au-delà des 8 caractères par défaut, qui sont insuffisants pour un compte qui commande et encaisse. |
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

`password_min_length` **n'est pas exposé** par l'endpoint public (c'est volontaire : ne
pas révéler la politique à un attaquant). Il est en revanche lisible dans la
configuration d'administration du projet, et il valait **6** le 23 novembre 2026.

Deux façons de le porter à 12 :

1. **Console** — Authentication → Providers → Email → *Minimum password length*.
2. **Admin API** — `PATCH /v1/projects/{ref}/config/auth` avec
   `{"password_min_length": 12, "password_required_characters": "lower_upper_letters_digits"}`.

Puis vérifier empiriquement sur la préproduction : `abcdefghij` (10 caractères) doit être
refusé, `Abcdefgh1234` (12) doit passer.

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
- **Le verrouillage après 5 essais** n'est pas implémenté côté code, et **il n'existe
  pas de réglage « verrouillage après N essais » dans Supabase Auth**. Ce que la
  plateforme offre est une limitation de débit (`rate_limit_verify`, `rate_limit_token_refresh`,
  et côté GoTrue un frein progressif sur les échecs de connexion par IP/utilisateur).
  Ce n'est pas la même chose : un attaquant patient n'est pas bloqué après 5 essais, il
  est ralenti. **Le CDC demande un verrouillage qui n'existe pas tel quel.**
  Deux options honnêtes : (a) reformuler l'exigence en « limitation de débit + mot de
  passe 12 caractères » et l'assumer par écrit ; (b) l'implémenter côté application avec
  un compteur d'échecs par compte. Aucune n'est faite. C'est écrit ici pour que personne
  ne coche cette ligne par ressemblance.

## 5. Journal des vérifications

| Date | Environnement | Résultat | Par |
|---|---|---|---|
| 23/11/2026 | **Production** (`evepzygucfxarpdnflzv`) | `jwt_exp` : **3600 → 43200** (12 h) ✅ | agent (connecteur Supabase) |
| 23/11/2026 | **Production** | `disable_signup` : **false → true** ✅ | agent (connecteur Supabase) |
| 23/11/2026 | **Production** | `refresh_token_rotation_enabled` : déjà `true` ✅ (rien à faire) | agent |
| 23/11/2026 | **Production** | `password_min_length` : **6** ❌ — non exposé par le connecteur, à passer à 12 en console | **non fait** |
| 23/11/2026 | **Production** | `password_required_characters` : vide ❌ — idem | **non fait** |
| — | **Préproduction** | Aucun projet de préproduction n'existe à ce jour. La vérification empirique (mot de passe de 10 refusé / 12 accepté) **n'a donc pas été faite**. | — |

### Ce que ce journal prouve, et ce qu'il ne prouve pas

**Prouvé** : la session expire au bout de 12 h au lieu d'une heure, et plus personne ne
peut créer de compte seul. Ce sont deux réglages de sécurité réels, appliqués sur la
base de production, avec la valeur d'avant connue.

**Non prouvé** : la longueur minimale du mot de passe. Tant qu'elle vaut 6, un compte
`amina@patisserie.dz` peut avoir `123456`. C'est le réglage le plus important des trois,
et c'est le seul qui reste à faire. Il demande soit la console, soit un appel
d'administration que le connecteur utilisé ici n'expose pas.

**Point à décider avant le premier client** : appliquer `password_min_length = 12` sur
le projet existant **n'invalide pas les mots de passe déjà définis** (Supabase ne
revalide pas à la connexion), mais empêche d'en définir un plus court à l'avenir. Les
trois comptes de démonstration actuels utilisent `PatisGest2026!` (13 caractères) : ils
passent la règle. Rien à réinitialiser.
