-- =====================================================================
-- 32 — Rattrapage Phase 1 de la revue : F-01 et F-18.
--
-- Pourquoi une migration et pas une édition de 21 / 27 : ces fichiers sont
-- déjà appliqués au pilote et leur empreinte est figée (repetition.json,
-- fixtures pilote). On corrige donc le corps INSTALLÉ, avec des gardes
-- strictes : si le corps n'est pas exactement celui attendu, la migration
-- s'arrête au lieu de deviner.
--
-- F-01 : une vente ne peut pas décrémenter le stock à un prix nul. Le
--        contrôle est dans vendre_panier (vendre_article en est un wrapper).
-- F-18 : patisgest_demander_commande lit v_site.subdomain ; la sélection
--        initiale ne charge que s.nom => « record "v_site" has no field
--        "subdomain" » pour tout visiteur. On sélectionne subdomain.
--
-- Compatible avec le brouillon 127 : si subdomain est déjà sélectionné,
-- 127 ne fait rien.
-- =====================================================================
begin;

do $migration$
declare
  definition text;
  corrigee text;
  n integer;
begin
  -- ---- F-01 : vendre_panier refuse un prix de vente nul ----------------
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 avant 32.';
  end if;

  n := (length(definition) - length(replace(definition,
         'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
         ''))) / length('if v_art.pv_ht is null or v_art.pv_ht < 0 or');
  if n = 0 then
    if position('if v_art.pv_ht is null or v_art.pv_ht <= 0 or' in definition) > 0 then
      null; -- déjà corrigée
    else
      raise exception 'Corps de vendre_panier inattendu : réconciliation manuelle requise.';
    end if;
  elsif n = 1 then
    corrigee := replace(definition,
      'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
      'if v_art.pv_ht is null or v_art.pv_ht <= 0 or');
    execute corrigee;
  else
    raise exception 'Garde de prix ambiguë dans vendre_panier : audit manuel requis.';
  end if;

  -- ---- F-18 : patisgest_demander_commande lit subdomain -----------------
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is not null then
    select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
      into definition;
    if position('select s.id, s.client_id, s.nom' in definition) > 0 then
      n := (length(definition) - length(replace(definition,
             'select s.id, s.client_id, s.nom', ''))) / length('select s.id, s.client_id, s.nom');
      if n <> 1 then
        raise exception 'Sélection vitrine ambiguë : audit manuel requis.';
      end if;
      corrigee := replace(definition,
        'select s.id, s.client_id, s.nom',
        'select s.id, s.client_id, s.subdomain');
      execute corrigee;
    elsif position('select s.id, s.client_id, s.subdomain' in definition) = 0 then
      raise exception 'Définition vitrine inattendue : audit manuel requis.';
    end if;
  end if;
end
$migration$;

commit;
