# Pilotes payants — dossier commercial (étape 5)

> **Statut : rédaction prête, signature humaine requise.** Les trois pilotes payants sont
> des conventions signées par des boutiques réelles, après des visites à Oran. Aucun agent
> ne peut les signer à la place de l'humain. Ce document fournit les **modèles** et les
> **intrants attendus** ; les cases `[…]` ne doivent être remplies qu'avec des faits réels,
> jamais inventées.
>
> Dépendance : la page de prix publique (étape 6) est conditionnée par cette étape —
> pas de publication avant que les pilotes existent. Voir [[GUIDE-PILOTE]] et
> `patisgest-app/migrations/ETAT-RESTAURATION.md`.

---

## 1. Intrants attendus (à fournir par l'humain)

| Champ | Exemple de forme | Où |
|---|---|---|
| Nom de la boutique | `[NOM]` | carnet de visite |
| Adresse / quartier (Oran) | `[ADRESSE]` | visite |
| Contact (nom, téléphone, fonction) | `[CONTACT]` | visite |
| Compte rendu de visite (date, observations, volume) | `[COMPTE RENDU]` | visite |
| Engagement (durée du pilote, objectif de marge) | `[ENGAGEMENT]` | échange |

Sans ces cinq champs, les documents ci-dessous restent des gabarits.

## 2. Script de prospection (visite ou appel)

**Ouverture (30 s).** Présentation courte : outil de gestion de pâtisserie, gratuit pendant
le pilote, installé et formé par nos soins. Demander la permission de poser trois questions.

**Questions (diagnostic).**
1. « Combien de références vendez-vous, et combien de productions par jour ? »
2. « Où perdez-vous le plus de temps : coûts, stock, caisse ou vitrine ? »
3. « Aujourd'hui, combien vous coûte une erreur de stock ou un prix mal saisi ? »

**Restitution (1 min).** Reformuler le poste de perte cité. Chiffrer la promesse :
réduction des ruptures et des invendus, prix et coûts à jour, commandes de la vitrine en ligne.

**Clause de sortie.** « Nous proposons un pilote de `[DURÉE]` chez trois boutiques d'Oran,
avec reprise de vos données et formation. Si au terme le gain n'est pas visible, vous gardez
vos données et l'outil reste à vous. »

## 3. Fiche d'offre — pilote

| Poste | Contenu |
|---|---|
| Durée | `[DURÉE]` semaines |
| Prix | 0 DA pendant le pilote |
| Inclus | installation, migration des données existantes, formation sur site |
| Objectif mesuré | rupture `[N]` %, invendus `[N]` %, saisie prix `[N]` min/jour |
| Engagement de la boutique | un référent, `[N]` h d'usage hebdomadaire |
| Fin de pilote | bilan chiffré + proposition de convention payante `[PRIX]` |

## 4. Convention de pilote — modèle

```
CONVENTION DE PILOTE — [NOM DE LA BOUTIQUE]

Entre [NOM DE LA BOUTIQUE], [FORME JURIDIQUE], immatriculée [RC], représentée par
[CONTACT], ci-après « la Boutique », et [EDITEUR], ci-après « l'Éditeur ».

Article 1 — Objet. L'Éditeur fournit à titre gratuit, pendant [DURÉE], l'outil de gestion
PâtisGest : [MODULES]. La Boutique s'engage à [ENGAGEMENT].

Article 2 — Données. Les données de la Boutique sont importées dans son espace dédié,
hébergé [HÉBERGEMENT]. Elles restent la propriété de la Boutique ; suppression sur demande.

Article 3 — Mesure. Les parties comparent, à la fin du pilote, [INDICATEURS]. Aucun engagement
de résultat n'est pris au-delà de la mise à disposition et de la formation.

Article 4 — Fin. À l'issue, la Boutique choisit entre la convention payante [PRIX] et la
cessation, avec restitution de ses données.

Fait à Oran, le [DATE].
Signature de la Boutique : ________________   Signature de l'Éditeur : ________________
```

## 5. Plan de suivi (modèle)

| Boutique | Contact | Visite | Diagnostic | Convention | Pilote | Bilan |
|---|---|---|---|---|---|---|
| `[NOM]` | `[CONTACT]` | `[DATE]` | `[POSTE]` | `[STATUT]` | `[STATUT]` | `[STATUT]` |
| `[NOM]` | `[CONTACT]` | `[DATE]` | `[POSTE]` | `[STATUT]` | `[STATUT]` | `[STATUT]` |
| `[NOM]` | `[CONTACT]` | `[DATE]` | `[POSTE]` | `[STATUT]` | `[STATUT]` | `[STATUT]` |

## 6. Étape 6 — page de prix publique (conditionnée)

La page de prix ne peut être publiée qu'après au moins un pilote payant : elle afficherait
alors un tarif sans référence réelle. Avant cela : page « sur devis » ou liste d'attente.
Voir `NOTE-HEBERGEMENT.md` pour les coûts à recouvrer.
