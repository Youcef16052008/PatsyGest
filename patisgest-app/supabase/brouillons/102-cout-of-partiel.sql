-- BROUILLON : à valider avant déploiement, après 24.
-- Les consommations sont enregistrées une seule fois au démarrage, pour
-- toute la quantité prévue. Répartir ce coût sur chaque unité prévue évite
-- de le recompter à chaque lot partiel. Les coûts historiquement enregistrés
-- ne sont pas modifiés : ils doivent être examinés séparément.
begin;
do $$
declare definition text; nouvelle text;
begin
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.oid=to_regprocedure('public.patisgest_terminer_of_interne(uuid,numeric,text,date)');
 if definition is null then raise exception 'Fonction interne de production absente : appliquer 24 avant 25.'; end if;
 -- Déjà corrigée par la migration 34 (série principale, revue F-20) : rejouable sans effet.
 if position('v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit' in definition)>0 then
  null;
 else
  if position('v_known / p_qte + v_overhead_unit' in definition)=0 then
   raise exception 'Définition inattendue : correction du coût partiel interrompue.';
  end if;
  nouvelle:=replace(definition,'v_known / p_qte + v_overhead_unit','v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit');
  execute nouvelle;
 end if;
end $$;
commit;
