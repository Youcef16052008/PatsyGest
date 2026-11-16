# 🧁 PâtisGest — Pack complet (novembre 2026)

## Contenu de cette archive

| Dossier / fichier | Qu'est-ce que c'est | Pour qui / quand |
|---|---|---|
| `PâtisGest-Final.html` | **Prototype v1.0** : le logiciel en 1 fichier (16 écrans, démo Oran). Double-clic = ça marche, même sans internet | Démo terrain Phase 0 (tablette) |
| `PâtisGest-GUIDE.md` | Guide : analyse des fichiers, site → logiciel, correspondance Next.js | Référence générale |
| `Documents/` | **Les 5 documents v4.0** (Word + Markdown) : 01 Cahier des charges · 02 Architecture · 03 Roadmap · 04 Plan 1 pilote · 05 Kit terrain | Imprimer le 05, signer, développer |
| `patisgest-app/` | **Le vrai logiciel** (Sprint 1 codé : connexion, rôles, base). Voir son `README.md` (10 étapes) | Développement Phase 1 |
| `patisgest-desktop/` | Enveloppe pour transformer le HTML en logiciel Windows (`npm install` puis `npm start`) | Option logiciel installé |

## Par où commencer (ordre conseillé)

1. Ouvre `PâtisGest-Final.html` (prototype) → explore les 16 écrans.
2. Lis `Documents/04-Plan-Attaque-1-Pilote` → programme de tes 10 semaines.
3. Imprime `Documents/05-Kit-Phase0-Terrain` → visite ton pilote (S1).
4. Suis `patisgest-app/README.md` → branche l'app réelle (comptes gratuits).
5. `Documents/01 + 02 + 03` = ta référence pendant tout le développement.

## Notes techniques

- `patisgest-app/` : après extraction, lance `npm install` (les dossiers lourds
  `node_modules/` et `.next/` ne sont pas inclus, c'est normal).
- Tes documents Word (.docx) s'ouvrent avec Word, LibreOffice ou Google Docs.
- Garde une copie de cette archive sur clé USB + un cloud (sécurité).

Bon courage — on attaque ! 🚀
