# Protocole de qualification matérielle et juridique

**Version 1 · 23 novembre 2026 · commit `50509b7`**

Trois exigences du CDC ne peuvent pas être satisfaites par du code, ni par un test
automatisé, ni par une IA : voir un ticket sortir d'une imprimante thermique, voir
trois personnes qui n'ont jamais utilisé le logiciel encaisser seules, et faire signer
un contrat de sous-traitance par l'hébergeur.

Ce document ne dit pas qu'elles sont faites. Il dit **exactement comment les faire**,
ce qu'il faut écrire, et ce qui compte comme un échec. Tant que la ligne de relevé en
fin de section est vide, l'exigence est **ouverte** — quel que soit l'état du code.

Règle commune : une case cochée sans la pièce jointe ne vaut rien. Le but n'est pas de
remplir un tableau, c'est de découvrir un problème avant un client.

---

## 1. NF-06 — Impression réelle sur 80 mm (Android 9+ / Chrome)

**Ce qui est déjà prouvé par les tests** (`tests/impression-ticket.test.mjs`, 7/7) :
largeur `80mm` à l'écran et à l'impression, `@page margin: 4mm`, aucun texte sous
10 px, mentions NIF/NIS/RC rendues quand elles existent, HT/TVA/TTC présents, masquage
`.no-print`. **Ce qui n'est pas prouvé : qu'une imprimante en sorte un ticket lisible.**

### Matériel

| Élément | Exigence | Si absent |
|---|---|---|
| Tablette ou téléphone | Android 9 minimum, Chrome à jour | Un PC Windows + Chrome/Edge vaut pour la moitié du test (mise en page), pas pour la manipulation en boutique |
| Imprimante | Thermique 80 mm, Bluetooth ou USB-OTG | Ne pas emprunter une 58 mm « pour voir » : elle ne prouve rien sur le format vendu |
| Rouleau | Papier thermique neuf | Un rouleau ancien grise le résultat et fausse la conclusion sur la taille de police |
| Mètre ou réglet | — | Pour mesurer la largeur imprimée |

### Déroulé (30 minutes, une seule fois par modèle d'imprimante)

1. **Configuration** — Paramètres → Établissement : renseigner NIF, NIS, RC et
   l'adresse. *Sans ces champs, la mention manquante est attendue et le test ne
   mesure rien.*
2. **Connexion** — Imprimer depuis la caisse (`/caisse`), pas depuis un aperçu
   navigateur. L'aperçu ne passe pas par le pilote de l'imprimante.
3. **Mesure** — Mesurer la largeur imprimée au réglet. Attendu : **72 mm ± 4 mm**
   (80 mm moins les marges de 4 mm de chaque côté). Noter la valeur.
4. **Lisibilité** — Se placer à 40 cm, éclairage de boutique ordinaire, et lire à
   voix haute : le nom du produit, le prix, la ligne des lots, le total. Si un des
   quatre n'est pas lisible **sans se rapprocher**, c'est un échec de NF-06, pas un
   détail.
5. **Coupe et encre** — Le ticket ne doit pas être coupé au milieu d'une ligne, et
   l'impression ne doit pas être grise (chaleur trop basse).
6. **Caractères** — Vérifier les accents (`Éclair`, `Crème`) et le symbole `%` de la
   TVA. Un encodage cassé sur une thermique est fréquent et invisible à l'écran.
7. **Double impression** — Réimprimer. Le numéro de ticket doit être identique ; une
   deuxième vente ne doit pas être créée (idempotence, CA-06).

### Ce qui compte comme échec

- Largeur hors de 72 ± 4 mm ;
- une des quatre lignes illisible à 40 cm ;
- accents ou `%` remplacés par des caractères parasites ;
- une réimpression qui crée une seconde vente.

### Relevé à remplir

```
Modèle d'imprimante : ..............  Connexion : Bluetooth / USB / réseau
Tablette ou PC      : ..............  Android : ......  Chrome : ......
Date du test        : ..............
Largeur mesurée     : ...... mm            [attendu 72 ± 4]
Ligne produit lisible à 40 cm      : oui / non
Ligne prix lisible à 40 cm         : oui / non
Ligne lots lisible à 40 cm         : oui / non
Total lisible à 40 cm              : oui / non
Accents corrects                   : oui / non
% de TVA correct                   : oui / non
Réimpression = même ticket, 0 doublon : oui / non
Photo du ticket joint              : oui / non
Verdict                            : CONFORME / NON CONFORME
```

**Statut actuel : ouvert.** Aucun ticket n'a jamais été imprimé sur papier.

---

## 2. NF-07 — Test avec 3 novices (critère CDC : < 1 h)

**Ce qui est déjà prouvé par les tests** (`tests/usabilite-parcours.test.mjs`, 6/6) :
encaisser en 2 clics depuis l'accueil, production en 1 clic, `/cloture` dans la barre
de navigation avec au moins 4 entrées principales visibles, cibles tactiles ≥ 44 px,
aucun texte sous 11 px, composeur de vente figé à 10 champs.
**Ce qui n'est pas prouvé : qu'une personne réelle y arrive seule.**

### Les trois novices

Ils doivent être **trois**, et aucun ne doit avoir vu le logiciel. Pas un collègue qui
a regardé par-dessus l'épaule, pas un développeur. Profils utiles : un vendeur de
commerce, une personne qui gère une pâtisserie, une personne peu à l'aise avec
l'informatique. C'est ce troisième profil qui révèle les vrais problèmes.

### Protocole (une personne à la fois, sans aide)

**Le testeur ne doit rien expliquer.** S'il explique, le test mesure le formateur, pas
le logiciel. S'il répond à « je clique où ? », le test est invalidé pour cette
personne et il faut recommencer avec quelqu'un d'autre.

1. Donner la tablette sur l'écran de connexion, avec les identifiants écrits sur un
   papier. **Chronomètre démarré.**
2. Consigne lue à voix haute, mot pour mot : *« Vous venez d'arriver dans cette
   boutique. Encaissez une vente de deux produits, puis regardez ce qu'il reste à
   faire aujourd'hui. »* Rien d'autre.
3. Laisser faire. **Noter l'heure de chaque étape** et, à chaque hésitation de plus de
   10 secondes, noter **où le regard s'est posé**. C'est l'information la plus utile
   du test.
4. Si la personne demande de l'aide : noter la question mot pour mot, ne pas répondre.
   Si elle reste bloquée plus de 5 minutes sur une même étape, arrêter et noter
   l'étape — c'est un échec, et c'est le résultat.
5. À la fin, trois questions ouvertes : *Qu'est-ce qui vous a gêné ? Qu'avez-vous
   cherché sans trouver ? Que feriez-vous si le réseau tombait ?*

### Ce qui compte comme échec

- Une personne sur trois n'encaisse pas **sans aide** : c'est un échec de NF-07, même
  si les deux autres réussissent en 4 minutes ;
- temps total supérieur à **60 minutes** pour au moins une personne ;
- une étape obligatoire introuvable sans menu déroulant.

Le CDC dit « ≤ 3 clics ». Le test automatisé prouve 2 clics depuis l'accueil ; le test
humain vérifie que ces 2 clics sont **trouvés**, ce qui n'est pas la même chose.

### Relevé à remplir (un bloc par personne)

```
Personne 1 — profil : ..............  Date : ............
  Connexion            : ..... min      hésitations : .....
  Trouver la caisse    : ..... min      hésitations : .....
  Encaisser 2 produits : ..... min      hésitations : .....
  Trouver la clôture   : ..... min      hésitations : .....
  TOTAL                : ..... min      [critère < 60]
  Aide demandée        : oui / non     (si oui → test invalidé)
  Verdict              : RÉUSSI / ÉCHEC
```

*(répéter pour les personnes 2 et 3)*

**Statut actuel : ouvert.** Aucune personne extérieure n'a utilisé le logiciel.

---

## 3. NF-05 — DPA signé et hébergement (loi 18-07)

**Ce qui est déjà prouvé par le code** : la minimisation (on ne collecte que nom,
téléphone, NIF/NIS/RC — pas d'e-mail client, la table `clients` n'en a pas), l'export
sur demande (`exporter_donnees_personnelles`), l'anonymisation sur demande
(`anonymiser_client`, migration 42), et le fait que ces deux fonctions soient
inaccessibles au rôle `anon` et refusées au vendeur (test dédié).
**Ce qui n'est pas du code : le contrat avec l'hébergeur, et le lieu physique des
données.**

### 3.1 Vérifier la région d'hébergement

1. Console Supabase → projet de production → **Settings → General → Region**.
   Noter la région exacte (ex. `eu-west-3`).
2. Console Vercel → projet → **Settings → Functions → Region**. Noter.
3. La loi 18-07 autorise les données à l'étranger **à condition** que le transfert soit
   encadré et que la personne en soit informée. Une région **UE** est la voie la plus
   simple ; une région US exige une base légale explicite (clauses contractuelles
   types) — à faire valider, pas à improviser.
4. Vérifier dans `mentions-legales` que la région affichée correspond à la réalité.
   **Une mention légale fausse est pire qu'une mention absente.**

### 3.2 Obtenir et signer le DPA

| Fournisseur | Où le trouver | Ce qu'il faut faire |
|---|---|---|
| Supabase | `supabase.com/legal/dpa` — accord de sous-traitance, signable en ligne selon l'offre | Télécharger le PDF signé, l'archiver avec la date |
| Vercel | `vercel.com/legal/dpa` — idem | Idem |

Points à vérifier dans le contrat, pas seulement à signer :

- **durée et sort des données à la résiliation** (restitution, suppression) ;
- **localisation des serveurs** et conditions de tout transfert hors UE ;
- **sous-traitants ultérieurs** (liste et droit d'opposition) ;
- **notification d'une violation de données** et son délai.

### 3.3 Registre des traitements (obligation distincte, souvent oubliée)

La loi 18-07 impose de tenir la liste des traitements : finalité, base légale,
catégories de données, destinataires, durée de conservation, mesures de sécurité.
L'architecture le place en V2. **Ce n'est pas optionnel pour autant** : c'est le
document qu'un contrôle demande en premier. Un tableau de 2 pages suffit pour démarrer.

### Relevé à remplir

```
Région Supabase (prod)     : ..............
Région Vercel (prod)       : ..............
Mentions légales cohérentes : oui / non
DPA Supabase signé le      : ..............  archivé : oui / non
DPA Vercel signé le        : ..............  archivé : oui / non
Clause de résiliation lue  : oui / non
Registre des traitements   : rédigé / absent
Verdict                    : CONFORME / OUVERT
```

**Statut actuel : ouvert.** Aucun DPA n'a été signé. Ce n'est pas un manque de code :
c'est un acte juridique qui engage l'entreprise, et il doit être fait avant la première
vente, pas avant la première ligne de code.

---

## 4. Ce qui n'est volontairement pas dans ce protocole

**Restauration testée mensuellement (NF-09).** Le code existe, la preuve non. La
restauration est **reportée par décision du 23 novembre 2026** : elle ne sera pas
traitée avant 15 clients, et deviendra alors une option payante. Ce n'est pas un
renoncement technique, c'est un arbitrage de priorité assumé — mais il crée une dette
qu'il faut nommer : **tant que NF-09 n'est pas démontrée, aucune sauvegarde n'est
prouvée restaurable.** Le jour où l'option est vendue, le protocole devra être écrit
et exécuté sur un projet jetable, avec comptage de lignes avant/après.

Tant que ce n'est pas fait, il faut le dire au client dans les mêmes termes : *« la
sauvegarde est quotidienne et la restauration n'a pas encore été éprouvée chez vous »*.
Le taire serait la seule faute réelle.

---

## 5. Synthèse — état au 23 novembre 2026

| Exigence | Code / tests | Preuve physique | Statut global |
|---|---|---|---|
| NF-01 performance | ✅ mesuré (18 000 ventes) | — | ✅ conforme |
| NF-02 hors-ligne | ✅ coquille cloisonnée + files | non testé sans réseau en boutique | 🟡 partiel (périmètre D5 assumé) |
| NF-05 DPA + région | ✅ code (migration 42) | ❌ | 🟡 code fait, juridique ouvert |
| NF-06 ticket 80 mm | ✅ 7/7 | ❌ jamais imprimé | 🟡 à qualifier |
| NF-07 parcours | ✅ 6/6 | ❌ aucun novice testé | 🟡 à qualifier |
| NF-09 restauration | code oui | reporté (15 clients) | ⏸ reporté, daté |
| NF-10 journal d'audit | ✅ migration 40 | — | ✅ conforme |

Trois lignes 🟡 restent ouvertes non par manque de travail, mais parce qu'elles
demandent quelqu'un devant une imprimante, trois personnes devant une tablette, et une
signature. **C'est la définition même de ce qui ne peut pas être livré par un commit.**
