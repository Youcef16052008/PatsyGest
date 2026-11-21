-- BROUILLON DE REPETITION : ne pas appliquer au pilote sans réconciliation.
-- Préserve la garde de site injectée par 106. Un autre conflit d'unicité
-- doit rester une erreur ; un ticket existant ne doit pas révéler une vente
-- d'un autre site ni confirmer un import Z comme vente de caisse. Un rejeu
-- confirme doit aussi avoir le même paiement, produits et quantités arrondies.
begin;
do $migration$
declare
 f regprocedure := to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
 src text; def text;
 selection constant text := 'select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement';
 debut constant text := '  if v_existing.id is not null then';
 fin_collision constant text := E'     limit 1;\n    return jsonb_build_object(';
 garde constant text := $guard$
    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from 'caisse' then
      raise exception 'Ticket deja utilise pour une autre vente.';
    end if;
    -- Même normalisation que le traitement de vente : identifiants UUID,
    -- regroupement par article, somme et arrondi à quatre décimales.
    if v_existing.mode_paiement is distinct from v_mode or
      (select jsonb_agg(jsonb_build_array(article_id, qte) order by article_id)
       from (select (coalesce(x->>'articleId', x->>'article_id'))::uuid article_id,
                    round(sum((x->>'qte')::numeric), 4) qte
               from jsonb_array_elements(p_lignes) x
              group by (coalesce(x->>'articleId', x->>'article_id'))::uuid) demande)
      is distinct from
      (select jsonb_agg(jsonb_build_array((x->>'articleId')::uuid, (x->>'qty')::numeric)
                        order by (x->>'articleId')::uuid)
         from jsonb_array_elements(v_existing.lignes) x)
    then
      raise exception 'Ticket deja utilise pour une autre vente.';
    end if;
 $guard$;
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
 def := replace(src,selection,selection || ', v.site_id, v.source, v.lignes');
 def := replace(def,debut,debut || garde);
 def := replace(def,fin_collision,E'     limit 1;\n    if v_existing.id is null then\n      raise;\n    end if;' || garde || E'\n    return jsonb_build_object(');
 execute def;
end
$migration$;
commit;
