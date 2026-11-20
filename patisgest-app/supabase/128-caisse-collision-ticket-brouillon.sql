-- BROUILLON DE REPETITION : ne pas appliquer au pilote sans réconciliation.
-- Préserve la garde de site injectée par 106. Un autre conflit d'unicité
-- doit rester une erreur ; un ticket existant ne doit pas révéler une vente
-- d'un autre site ni confirmer un import Z comme vente de caisse.
begin;
do $migration$
declare
 f regprocedure := to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
 src text; def text;
 selection constant text := 'select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement';
 debut constant text := '  if v_existing.id is not null then';
 fin_collision constant text := E'     limit 1;\n    return jsonb_build_object(';
begin
 if f is null then raise exception 'RPC vendre_panier absente'; end if;
 select pg_get_functiondef(f) into src;
 if position('perform public.patisgest_exiger_site(p_site_id);' in src)=0 then
  raise exception 'Garde de site manquante : reconciliation requise';
 end if;
 -- Vérifier exactement deux recherches, puis les deux points de retour.
 if (length(src)-length(replace(src,selection,'')))/length(selection) <> 2
    or (length(src)-length(replace(src,debut,'')))/length(debut) <> 1
    or (length(src)-length(replace(src,fin_collision,'')))/length(fin_collision) <> 1 then
  raise exception 'Corps de vendre_panier inattendu : reconciliation requise';
 end if;
 def := replace(src,selection,selection || ', v.site_id, v.source');
 def := replace(def,debut,debut || E'\n    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from ''caisse'' then\n      raise exception ''Ticket deja utilise pour une autre vente.'';\n    end if;');
 def := replace(def,fin_collision,E'     limit 1;\n    if v_existing.id is null then\n      raise;\n    end if;\n    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from ''caisse'' then\n      raise exception ''Ticket deja utilise pour une autre vente.'';\n    end if;\n    return jsonb_build_object(');
 execute def;
end
$migration$;
commit;
