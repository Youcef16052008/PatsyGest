-- =====================================================================
-- 34 — Coût des OF partiellement produits (revue F-20, rapport externe B-004).
--
-- Bug : terminer_of calcule le coût unitaire avec `v_known / p_qte`, où p_qte
-- est la quantité du lot partiel. Or les consommations (v_known) sont
-- enregistrées UNE fois, au lancement, pour toute la quantité prévue. Chaque
-- lot partiel réimpute donc la totalité : 1 000 DA de matières, lots 50 + 50
-- => 2 000 DA comptés au lieu de 1 000.
--
-- Correction : diviser par la quantité PRÉVUE de l'OF, la même pour tous les lots.
--
-- Portée : seules les NOUVELLES clôtures de lots sont corrigées. Les coûts
-- déjà enregistrés ne sont pas modifiés ; leur revue est une décision séparée.
-- Garde stricte : la migration refuse de s'appliquer si le corps installé n'est
-- pas exactement celui attendu (une seule occurrence de la formule).
-- =====================================================================
begin;

do $migration$
declare
  definition text;
  corrigee   text;
  n          integer;
  ancien     constant text := 'v_known / p_qte + v_overhead_unit';
  nouveau    constant text := 'v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit';
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.terminer_of(uuid,numeric,text,date)');
  if definition is null then
    raise exception 'RPC terminer_of absente : appliquer 07 avant 34.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée : migration rejouable sans effet
  else
    raise exception 'Formule de coût de terminer_of inattendue (occurrences : %) : audit manuel requis.', n;
  end if;
end
$migration$;

commit;
