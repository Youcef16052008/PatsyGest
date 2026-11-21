-- F-01 — remplissage des articles à prix de vente nul (pilote, 12 lignes).
-- Décision utilisateur : prix aléatoire entier dans ]0 ; 50] DA.
-- Exécuté une seule fois sur le projet evepzygucfxarpdnflzv. Ne pas rejouer :
-- la condition `pv_ht <= 0` ne cible plus rien après exécution.
update public.articles
   set pv_ht = (floor(random() * 50) + 1)::numeric
 where coalesce(pv_ht, 0) <= 0
returning id, code, nom, pv_ht;

-- Résultat constaté (12 lignes) :
-- MP-FAR 13 · MP-SUC 48 · MP-BEU 30 · MP-OEU 4 · MP-CHO 3 · MP-CRE 47
-- MP-LAI 32 · MP-AMA 40 · MP-MIE 8 · SF-CPA 25 · SF-PFE 27 · cbfb 43
-- Note : 9 lignes sont des matières premières (MP-*) ; leur prix de vente n'a pas de sens métier.
