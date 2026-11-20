# Reconstitution vitrine pour tests isolés

Ces sept fichiers sont des copies de `patisgest-app/supabase/25-domaines-boutiques.sql` à `31-publication-vitrine.sql` du commit main `24ec425d6fa908c0b244c2c1fc728bd4ab1e6e4f`. Ils sont exécutés **uniquement dans la pile Supabase CLI jetable**, après la reconstruction 01–23 et avant les brouillons sécurité de cette branche. Ils ne sont pas des migrations à appliquer ici au pilote : les anciens numéros 24–50 des brouillons sécurité ont été déplacés vers 101–127, sans établir la compatibilité avec le pilote.

Les migrations portant les noms correspondants figurent déjà dans l'historique du pilote consulté en lecture seule. Les fichiers du dépôt ne prouvent pas qu'ils sont identiques aux définitions effectives : les divergences connues de 01–23, les ACL, les données, les extensions, le stockage et les changements ultérieurs doivent être comparés avant déploiement. Cette reconstruction ne constitue pas une sauvegarde ni une copie du pilote.
