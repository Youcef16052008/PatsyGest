# GUIDE-PILOTE.md — ce qu'il te reste à faire, clic par clic

Sept choses restent ouvertes. Elles ne sont **pas** automatisables depuis la
sandbox (pas de route réseau vers Vercel/Supabase, pas de navigateur, pas
d'imprimante). Voici comment les faire toi-même, dans l'ordre.

**Temps total estimé : ~2 h 30**, étalées sur environ une semaine pour la
partie « pilote réel ».

---

## Préparation (5 min)

Comptes de connexion — attention, le mapping est celui de la base :

| Email | Rôle | Mot de passe |
|---|---|---|
| `amina@patisserie.dz` | **propriétaire** | `PatisGest2026!` |
| `sara@patisserie.dz` | **labo** | `PatisGest2026!` |
| `amine@patisserie.dz` | **vendeur** | `PatisGest2026!` |

Ouvre deux navigateurs différents (ou une fenêtre de navigation privée) pour
pouvoir être connecté en propriétaire dans l'un et en vendeur dans l'autre.

---

## ÉTAPE 1 — Mettre le code en production (10 min)

Le code est prêt sur la branche, la production est encore sur l'ancienne
version.

1. Va sur **https://github.com/Youcef16052008/PatsyGest/pull/3**
2. Lis la description jusqu'à la section « Ce que cette PR ne permet PAS de
   déclarer » — c'est volontaire, ne la saute pas.
3. Clique sur l'onglet **Conversation**, puis sur le bouton vert
   **« Merge pull request »** en bas.
4. Clique **« Confirm merge »**.
5. Dans **Vercel** (https://vercel.com/all-intelligence/patsy-gest), onglet
   **Deployments** : attends qu'un déploiement `production` passe en **Ready**
   (environ 1 min). Le commit doit être `1a86696` ou plus récent.
6. Ouvre **https://patsy-gest-all-intelligence.vercel.app** → la page de
   connexion doit s'afficher.

> ⚠️ Si le bouton de merge est grisé : c'est un conflit. Ne force rien,
> dis-le-moi.

---

## ÉTAPE 2 — E2E avec la vraie authentification (25 min)

C'était le point n°1 manquant : personne n'a encore testé l'application avec
la vraie connexion Supabase, seulement avec des sessions de test.

**2.1 — Connexion propriétaire**

1. Sur la page de connexion, saisis `amina@patisserie.dz` / `PatisGest2026!`
2. Clique **Se connecter**.
3. Tu dois arriver sur **« Bonjour … 👋 »** avec les tuiles colorées.
   ❌ Si tu restes sur `/connexion` ou vois une erreur : **note le message
   exact** et arrête-toi là (dis-le-moi).

**2.2 — Vérifier que le vendeur ne voit pas les coûts**

4. Clique sur **⬇ Déconnexion** en haut à droite.
5. Connecte-toi avec `amine@patisserie.dz` / `PatisGest2026!` (vendeur).
6. Sur le tableau de bord, cherche les tuiles **« Recettes & coûts »** et
   **« Simulation prix »** : elles doivent être **absentes**. ✅ attendu
7. Tape directement dans la barre d'adresse :
   `https://patsy-gest-all-intelligence.vercel.app/recettes`
   → tu dois voir une page **sans** coût, ou un refus. ❌ Si tu vois
   `mo_min`, `énergie` ou un coût de revient : **c'est une fuite, note-le**.

**2.3 — Vérifier que le labo ne peut pas changer les mentions légales**

8. Déconnexion, connecte-toi avec `sara@patisserie.dz` (labo).
9. Va sur `/parametres` (ajoute l'adresse à la main).
10. Tu dois voir les NIF/NIS/RC en **lecture seule**, avec la phrase
    « Seul le propriétaire peut modifier ces mentions ». ✅ attendu
11. ❌ Si tu vois un formulaire avec des champs modifiables et un bouton
    **Enregistrer** : note-le, c'est un défaut.

**2.4 — Configurer l'identité légale (propriétaire)**

12. Déconnexion, reconnecte-toi en `amina@patisserie.dz`.
13. Va sur **Paramètres** (lien en haut).
14. Tu verras un **encadré orange** : les NIF/NIS actuels font 9 chiffres au
    lieu de 15. **C'est normal**, ce sont des valeurs de démonstration.
15. Renseigne tes **vrais** NIF, NIS, RC (15 chiffres pour NIF et NIS), puis
    **Enregistrer l’identité**.
16. L'aperçu « en-tête ticket » en dessous doit afficher ton nom, ton adresse
    et les 3 identifiants. L'encadré orange doit disparaître.

**2.5 — Vérifier le ticket**

17. Va sur **Caisse**, vends 1 produit.
18. Le ticket 80 mm doit afficher **ton nom, adresse, NIF, NIS, RC** en haut
    (plus « PâtisGest — Caisse »).
19. Clique **Imprimer le ticket** (ou Ctrl+P) : vérifie que seul le ticket
    s'imprime, largeur 80 mm.

---

## ÉTAPE 3 — Sauvegarde et restauration (20 min)

C'était le point le plus risqué : la restauration n'a jamais été exercée
depuis un navigateur.

**3.1 — Sauvegarder**

1. Connecté en **propriétaire**, va sur **Paramètres**.
2. Section **Sauvegarde & restauration** → clique
   **⬇ Télécharger la sauvegarde complète**.
3. Un fichier `patisgest-sauvegarde-....json` se télécharge.
   ✅ Ouvre-le : tu dois voir `"format": "patisgest-sauvegarde"`, ton nom
   d'établissement, et la liste de tes tables avec leurs lignes.
4. **Garde ce fichier** : c'est ta sauvegarde réelle.

**3.2 — Restaurer sans rien casser**

La restauration **ajoute** les lignes, elle ne supprime jamais rien. Le
scénario sûr :

5. Toujours dans Paramètres, clique sur **« Restaurer une sauvegarde… »**.
6. Choisis le fichier téléchargé à l'étape 3.
7. Clique **« 1. Analyser le fichier »**.
8. Tu dois voir la liste « articles : 16 · lots : 12 … » et le nombre total de
   lignes. ✅ Si tu vois « Sauvegarde refusée », note le message exact.
9. Tape **RESTAURER** dans le champ, puis clique
   **« 2. Confirmer la restauration »**.
10. Message attendu : **« Restauration terminée : 0 ligne(s) réinsérée(s) ·
    N table(s) déjà présente(s) ignorée(s) »**.
    ✅ C'est le bon résultat : tout existe déjà, donc **rien n'est dupliqué**.
11. Retourne sur **Stocks** : le nombre d'articles doit être **identique**
    à avant (aucun doublon).

> ⚠️ Ne teste **pas** la suppression de données pour voir si ça restaure.
> Si tu veux vraiment tester, fais-le sur une copie de la base, pas sur le
> pilote.

---

## ÉTAPE 4 — La journée sans internet (30 min + une journée réelle)

C'était le point n°2 : la file hors-ligne n'a jamais vu une vraie coupure.

**4.1 — Coupure simulée (5 min)**

1. Connecté en **vendeur** (`amine`), va sur **Caisse**.
2. Vends 1 produit → normal, ça passe.
3. **Coupe internet** : sur ton ordinateur, désactive le Wi-Fi, ou débranche
   le câble réseau. (Le plus simple : mode avion.)
4. Vends encore 2 produits.
   ✅ Attendu : un message du type « mise en file » ou « réseau
   inaccessible », **pas** une erreur rouge bloquante. Les ventes doivent
   apparaître dans une liste « en attente ».
5. **Rétablis internet**.
6. Clique sur l'indicateur d'état de synchronisation (ou attends ~10 s).
7. ✅ Les ventes en attente doivent disparaître de la liste et se retrouver
   dans l'historique.
8. **Vérifie l'absence de doublon** : les 2 ventes doivent apparaître **une
   seule fois** chacune.

**4.2 — Journée réelle (une vraie journée d'ouverture)**

9. Le jour où tu encaisses réellement : utilise la caisse normalement.
10. Note les moments où ça bloque, les messages incompréhensibles, les
    lenteurs. C'est ça qui compte, pas un test de 5 minutes.

---

## ÉTAPE 5 — Le contrôle de coût à 3 pâtissiers (20 min, à faire à 3)

C'était le point n°3 : les coûts n'ont jamais été validés par quelqu'un qui
fait vraiment de la pâtisserie.

1. Assieds-toi avec **3 pâtissiers** (ou 2 + toi).
2. Connecté en propriétaire, va sur **Recettes & coûts**, ouvre une recette
   (par exemple le millefeuille).
3. Demande-leur : « ce coût de revient par portion, il est crédible ? »
4. Regardez ensemble **chaque poste** : matières, main-d'œuvre, énergie,
   emballage, frais généraux.
5. Note les écarts : trop cher, pas assez cher, poste oublié.
6. Le tarif horaire et les charges se règlent dans **Paramètres** (ou en base
   dans `parametres_couts` — dis-moi si tu veux que j'ajoute l'écran).

> C'est le seul point où **je ne peux pas t'aider** : il faut quelqu'un qui
> connaît le métier.

---

## ÉTAPE 6 — Chronométrer l'onboarding (30 min)

Le critère dit « un novice termine en moins d'une heure ».

1. Trouve quelqu'un qui **ne connaît pas** l'application (pas toi).
2. Chronomètre au moment où il clique **Se connecter**.
3. Laisse-le faire **sans l'aider** : il doit créer une matière, un produit,
   une recette, un ordre de fabrication, une vente.
4. Son guide : l'encadré **« Premiers pas »** sur le tableau de bord, qui
   indique la prochaine action.
5. Arrête le chrono à la première vente réussie.
6. ✅ Objectif : moins de 60 minutes. Note le temps réel et **où il a
   bloqué** — c'est ça qui est utile.

---

## ÉTAPE 7 — Les mentions légales (à faire faire, 1 h de ton côté)

Le texte de `/mentions-legales` est un **modèle** que j'ai rédigé. Il n'a
aucune valeur tant qu'un professionnel ne l'a pas relu.

1. Ouvre **https://patsy-gest-all-intelligence.vercel.app/mentions-legales**
2. Fais une **impression PDF** (Ctrl+P → Enregistrer en PDF).
3. Envoie ce PDF à :
   - ton **comptable** → pour la partie TVA, NIF/NIS, conservation des
     documents ;
   - un **juriste** ou le CACI → pour les CGV, la protection des données,
     les obligations d'affichage.
4. Note leurs corrections. Envoie-les-moi : je les applique dans le code.

---

## Ordre recommandé

| Quand | Quoi | Durée |
|---|---|---|
| Maintenant | Étape 1 (merge + déploiement) | 10 min |
| Maintenant | Étape 2 (E2E auth réelle) | 25 min |
| Maintenant | Étape 3 (sauvegarde/restauration) | 20 min |
| Cette semaine | Étape 4.1 (coupure simulée) | 5 min |
| Cette semaine | Étape 7 (envoyer aux pros) | 1 h de ton côté |
| Un jour d'ouverture | Étape 4.2 (journée réelle) | une journée |
| Quand tu peux réunir 3 personnes | Étape 5 (coûts) | 20 min |
| Quand tu trouves un novice | Étape 6 (chrono) | 30 min |

---

## Si quelque chose casse

Note **exactement** :

1. **Quel écran** (l'adresse dans la barre du navigateur).
2. **Quel rôle** (propriétaire / labo / vendeur).
3. **Le message d'erreur**, mot pour mot (ou une capture).
4. **Ce que tu venais de faire** (la dernière action).

Avec ces 4 éléments je peux reproduire et corriger. Sans eux, je devine — et
deviner coûte plus cher que mesurer.
