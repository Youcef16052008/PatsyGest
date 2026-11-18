# GUIDE-PILOTE.md — ce qu'il te reste à faire, clic par clic

Ce guide décrit les vérifications à faire dans le navigateur sur le pilote.
Les tests locaux ne remplacent pas la vérification avec les vrais comptes,
la base du pilote et l'imprimante de caisse.

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

## ÉTAPE 1 — Vérifier la version déployée (10 min)

La PR #3 est déjà mergée. Les nouveaux correctifs et le guide B doivent être
mis en ligne avant le retest sur le pilote.

1. Sur la base pilote déjà en migration 18, appliquer dans l'ordre :
   - [`19-confidentialite-familles-recettes.sql`](patisgest-app/supabase/19-confidentialite-familles-recettes.sql) : ferme la lecture des familles de recettes au vendeur, y compris via l'API de la base.
   - [`20-creation-fournisseur.sql`](patisgest-app/supabase/20-creation-fournisseur.sql) : autorise propriétaire et labo à ajouter un fournisseur dans leur établissement.
2. Dans **Vercel** (https://vercel.com/all-intelligence/patsy-gest), onglet
   **Deployments** : vérifier qu'un déploiement `production` contenant les
   correctifs est **Ready**.
3. Ouvrir **https://patsy-gest-all-intelligence.vercel.app** → la page de
   connexion doit s'afficher.

---

## ÉTAPE 2 — E2E avec la vraie authentification (25 min)

Utilise les vrais comptes du pilote pour vérifier ce que chaque rôle voit,
en plus des tests HTTP locaux.

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
7. Tape directement `/recettes`, puis `/simulation`, dans la barre d'adresse.
   Les deux doivent te ramener à **`/tableau-de-bord`**. Afficher seulement
   « Versions · 0 » ou les noms des recettes n'est **pas** un résultat valide.
   Refais le test en **propriétaire** : les deux pages et leurs formulaires
   doivent s'ouvrir normalement.

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
19. Dans **Chrome**, clique **Imprimer le ticket** (ou Ctrl+P) →
    **Enregistrer en PDF**. Attendu : **une seule page** avec le ticket complet
    (nom, adresse, NIF, NIS, RC, numéro, article, HT et TTC), sans le pied de
    page de l'application. Refais le test dans **Firefox**. Pour l'imprimante,
    choisis le papier **80 mm** et désactive les en-têtes et pieds de page du
    navigateur si l'URL ou la date d'impression y est ajoutée.

---

## ÉTAPE 3 — Sauvegarde et restauration (20 min)

La confirmation de restauration doit rester indisponible tant que le fichier
choisi n'a pas été analysé avec succès. La taille maximale est de **4 Mio**.

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
8. Le bouton doit sortir de l'état « Analyse… » et afficher le résumé. Avec
   le fichier pilote du 17/11/2026, vérifie **58 lignes**, dont **16 articles**
   et **12 lots**. Si l'analyse échoue, elle affiche une erreur et la
   confirmation reste inactive.
9. **Sans sélectionner à nouveau le fichier**, tape **RESTAURER**, puis clique
   **« 2. Confirmer la restauration »**.
10. Message attendu : **« Restauration terminée : 0 ligne(s) réinsérée(s) ·
    N table(s) déjà présente(s) ignorée(s) »**.
    ✅ C'est le bon résultat : tout existe déjà, donc **rien n'est dupliqué**.
11. Retourne sur **Stocks** : le nombre d'articles doit être **identique**
    à avant (aucun doublon).

**Retest sans écriture :** après une analyse valide, choisis un autre fichier
`.json` qui contient seulement `{`. Le résumé précédent doit disparaître.
Clique **Analyser** : l'erreur « Fichier illisible » doit apparaître et la
confirmation rester inactive. Resélectionne le bon fichier et réanalyse-le :
le résumé doit revenir.

> ⚠️ Ne supprime aucune donnée pour tester la restauration. Pour un scénario
> d'insertion, utilise une copie de la base, pas le pilote.

Le fichier original du 17/11 peut aussi être testé localement, sans l'ajouter
à Git : depuis `patisgest-app`, lance
`PATISGEST_TEST_SAUVEGARDE=/chemin/vers/sauvegarde-pilote.json npm test`.

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

## ÉTAPE 6 — Vérifier et chronométrer le guide B

La [maquette B (page 2)](P%C3%A2tisGest-Documents/06-Maquettes-Onboarding.pdf)
est celle retenue : un groupe de champs à la fois, dans chaque module.

**Retest fonctionnel** — utilise un établissement de test vide, déjà initialisé
avec un compte propriétaire ou labo et au moins un site. Ne crée pas de vente
fictive dans la caisse du pilote. Si les six étapes sont déjà terminées dans
un établissement, l'encadré « Premiers pas » n'y apparaît plus.

1. Tableau de bord → **Premiers pas**, compteur **0 / 6**. Déplie **Voir les
   6 étapes**, puis clique **Me guider**.
2. Dans **Stocks**, vérifie le focus sur **Nom**. Saisis un nom et un code,
   puis clique **Continuer**. Seuls le type et l'unité sont affichés maintenant.
   Le compteur reste à **0 / 6**. **Retour** doit garder le nom et le code.
3. Passe à **Enregistrer**, puis crée l'ingrédient. Attends **1 / 6**. Avec
   **Quitter le guide**, vérifie que le tableau de bord propose le produit
   fini. **Formulaire complet** ouvre la vue habituelle du module.
4. Termine le produit, le fournisseur, la recette et l'ordre de fabrication.
   La fiche recette seule ne suffit pas : crée et active une version avec
   ses ingrédients. **Passer pour l’instant** ne valide ni le fournisseur ni
   l'OF. Ils resteront à terminer pour obtenir **6 / 6**.
5. À la dernière étape, encaisse une vente dans l'établissement de test.
   Si la connexion est coupée, la vente (ou l'OF) reste en attente : le
   compteur ne monte pas tant que l'opération n'est pas enregistrée en base.
   Après le retour du réseau, **Synchroniser maintenant**, sans recréer
   l'opération ; vérifie qu'il n'y a qu'un enregistrement et que le ticket
   de vente s'affiche. Termine à **6 / 6** et reviens au tableau de bord.

**Critère humain CA-15 — moins de 60 minutes.** Confie le parcours à quelqu'un
qui n'a jamais utilisé PâtisGest. Lance le chrono à **Se connecter**, laisse-le
avancer sans aide et arrête le chrono à **6 / 6**, avec le ticket affiché.
Note le temps réel et les groupes où il a hésité. Les tests automatisés
vérifient le fonctionnement, pas la rapidité d'un novice.

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
| Après la mise en ligne | Étape 1 (migration et version déployée) | 10 min |
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
