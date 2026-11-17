-- =====================================================================
-- Migration 09 — Journaux : clôture (six flux), qualité/HACCP,
-- planning, Cake Design. Écritures RLS + RPC sécurisées.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- =====================================================================

-- ------------------------------------------------- colonnes & contraintes
ALTER TABLE public.clotures ALTER COLUMN revision SET DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS clotures_revision_unique
  ON public.clotures (client_id, date_cloture, site_id, revision);

ALTER TABLE public.non_conformites ADD COLUMN IF NOT EXISTS historique jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cakes ADD COLUMN IF NOT EXISTS paiements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Statuts NC : valeurs seed 'Ouverte'/'Clôturée' + minuscules (sans accent)
ALTER TABLE public.non_conformites DROP CONSTRAINT IF EXISTS non_conformites_statut_valid;
ALTER TABLE public.non_conformites ADD CONSTRAINT non_conformites_statut_valid
  CHECK (statut IN ('ouverte','cloturee','Ouverte','Clôturée'));

-- Statuts cakes alignés sur les transitions (devis/acompte/confirme/produit/livre/annule)
ALTER TABLE public.cakes DROP CONSTRAINT IF EXISTS cakes_statut_valid;
ALTER TABLE public.cakes ADD CONSTRAINT cakes_statut_valid
  CHECK (statut IN ('devis','acompte','confirme','produit','livre','annule'));

ALTER TABLE public.bons_commande DROP CONSTRAINT IF EXISTS bons_commande_statut_valid;
ALTER TABLE public.bons_commande ADD CONSTRAINT bons_commande_statut_valid
  CHECK (statut IN ('commande','partiel','recu'));

-- ------------------------------------------------- politiques RLS
CREATE POLICY insert_temp ON public.releve_temperatures
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

CREATE POLICY insert_nettoyage ON public.nettoyages
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- Mise à jour du pointeur « fait » (bascule de tâche/nettoyage)
CREATE POLICY update_nettoyage ON public.nettoyages
  FOR UPDATE TO authenticated USING (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'))
  WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- NC : le statut est imposé 'ouverte' à l'ouverture (passer par la RPC pour clôturer)
CREATE POLICY insert_non_conformite ON public.non_conformites
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo')
    AND statut IN ('ouverte','Ouverte'));

CREATE POLICY insert_tache ON public.taches_planning
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

CREATE POLICY update_tache ON public.taches_planning
  FOR UPDATE TO authenticated USING (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'))
  WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- clotures / cakes / bons_commande / historique_prix : AUCUNE policy d'écriture
-- → écritures uniquement via les RPC security definer (clôture, cakes, commandes).

-- =====================================================================
-- RPC : saisir_cloture — clôture déclarative six flux avec révisions
-- =====================================================================
create or replace function public.saisir_cloture(
  p_date date, p_site_id uuid, p_lignes jsonb, p_revise boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int := 1;
  l jsonb;
  v_article uuid;
  v_count int := 0;
  v_enriched jsonb := '[]'::jsonb;
  v_art record;
  v_produit numeric;
  v_out jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then
    raise exception 'Role non autorise.';
  end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Liste de produits invalide (1 a 100).';
  end if;

  select count(*) into v_existing from public.clotures c
    where c.client_id = v_client and c.date_cloture = p_date and c.site_id = p_site_id;
  if v_existing > 0 then
    if coalesce(p_revise, false) = false then
      raise exception 'Une cloture existe deja pour ce site et cette date. Cochez correction pour creer une nouvelle revision.';
    end if;
    select coalesce(max(c.revision), 0) + 1 into v_revision from public.clotures c
      where c.client_id = v_client and c.date_cloture = p_date and c.site_id = p_site_id;
  end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    begin
      v_article := (l->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article de cloture invalide.';
    end;
    if v_count >= 100 then raise exception 'Trop de produits (100 maximum).'; end if;

    select a.id, a.code, a.nom, a.unite, a.pu_ht, a.niveau into v_art
      from public.articles a where a.id = v_article and a.client_id = v_client;
    if not found then raise exception 'Article introuvable ou hors perimetre.'; end if;
    if v_art.niveau <> 'produit' then raise exception 'Seuls les produits finis se cloturent.'; end if;

    v_produit := (l->>'produit')::numeric;
    if v_produit is null or v_produit < 0 or v_produit > 1000000000
       or v_produit <> round(v_produit, 4) then
      raise exception 'Quantite produite invalide.';
    end if;
    if coalesce((l->>'vendu')::numeric, -1) < 0 or coalesce((l->>'reporte')::numeric, -1) < 0
       or coalesce((l->>'jete')::numeric, -1) < 0 or coalesce((l->>'casse')::numeric, -1) < 0
       or coalesce((l->>'offert')::numeric, -1) < 0 then
      raise exception 'Flux negatif interdit.';
    end if;

    v_enriched := v_enriched || jsonb_build_object(
      'articleId', v_article,
      'code', v_art.code,
      'name', v_art.nom,
      'unit', v_art.unite,
      'priceHT', coalesce(v_art.pu_ht, 0),
      'produit', v_produit,
      'vendu', coalesce((l->>'vendu')::numeric, 0),
      'reporte', coalesce((l->>'reporte')::numeric, 0),
      'jete', coalesce((l->>'jete')::numeric, 0),
      'casse', coalesce((l->>'casse')::numeric, 0),
      'offert', coalesce((l->>'offert')::numeric, 0));
    v_count := v_count + 1;
  end loop;

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, agent_id)
  values (v_client, p_date, p_site_id, v_revision, v_enriched, v_auth)
  returning id into v_out;

  return jsonb_build_object(
    'cloture_id', v_out,
    'revision', v_revision,
    'lignes', v_count);
end;
$$;

revoke execute on function public.saisir_cloture(date, uuid, jsonb, boolean) from public, anon;
grant execute on function public.saisir_cloture(date, uuid, jsonb, boolean) to authenticated, service_role;

-- =====================================================================
-- RPC : maj_non_conformite — ouverture historisée / clôture avec action
-- =====================================================================
create or replace function public.maj_non_conformite(p_id uuid, p_statut text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  nc record;
  v_new text;
  v_hist jsonb;
  v_action text := nullif(trim(coalesce(p_action, '')), '');
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  if p_statut not in ('ouverte','cloturee') then raise exception 'Statut invalide.'; end if;
  if length(coalesce(p_action, '')) > 500 then raise exception 'Action corrective trop longue (500 max).'; end if;

  select c.* into nc from public.non_conformites c where c.id = p_id for update;
  if not found then raise exception 'Non-conformite introuvable.'; end if;
  if nc.client_id <> v_client then raise exception 'Non-conformite hors perimetre.'; end if;

  if p_statut = 'cloturee' and v_action is null then
    raise exception 'Renseignez une action corrective avant de cloturer.';
  end if;

  v_new := case when lower(nc.statut) in ('ouverte') then 'ouverte' else 'cloturee' end;
  if p_statut = v_new then
    raise exception 'Statut deja applique.';
  end if;

  v_hist := coalesce(nc.historique, '[]'::jsonb) || jsonb_build_object(
    'at', now(), 'statut', p_statut, 'action', coalesce(v_action, ''));

  update public.non_conformites c
    set statut = p_statut,
        action = coalesce(nullif(trim(v_action), ''), c.action),
        historique = v_hist
   where c.id = p_id
   returning c.id, c.statut into nc;

  return jsonb_build_object('id', nc.id, 'statut', nc.statut);
end;
$$;

revoke execute on function public.maj_non_conformite(uuid, text, text) from public, anon;
grant execute on function public.maj_non_conformite(uuid, text, text) to authenticated, service_role;

-- =====================================================================
-- RPC : creer_cake — devis Cake Design (rétroplanning J-3/J-1/J)
-- =====================================================================
create or replace function public.creer_cake(
  p_client_nom text, p_telephone text, p_date_event date, p_nb_parts int,
  p_prix_ht numeric, p_options jsonb, p_notes text, p_cgv boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_id uuid;
  v_numero text;
  v_retro jsonb;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_cout numeric;
  v_min int;
  v_nom text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;

  if p_client_nom is null or length(trim(p_client_nom)) < 1 or length(trim(p_client_nom)) > 100 then
    raise exception 'Nom du client requis (1 a 100 caracteres).';
  end if;
  if p_telephone is not null and length(p_telephone) > 40 then
    raise exception 'Telephone trop long (40 max).';
  end if;
  if p_date_event is null or p_date_event < DATE '2000-01-04' then
    raise exception 'Date d''evenement invalide.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 a 10000).';
  end if;
  if p_prix_ht is null or p_prix_ht <= 0 or p_prix_ht > 100000000000 then
    raise exception 'Prix HT invalide.';
  end if;
  if coalesce(p_notes, '') <> '' and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 max).';
  end if;

  if p_options is not null and jsonb_typeof(p_options) = 'array' then
    if jsonb_array_length(p_options) > 50 then
      raise exception 'Trop d''options (50 max).';
    end if;
    for o in select value from jsonb_array_elements(p_options) loop
      v_nom := trim(coalesce(o->>'name', ''));
      v_cout := (o->>'cout')::numeric;
      v_min := (o->>'minutes')::integer;
      if v_nom = '' or length(v_nom) > 100 then raise exception 'Option : nom requis (100 max).'; end if;
      if v_cout is null or v_cout < 0 or v_cout > 1000000000 then
        raise exception 'Option : cout invalide.'; end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.'; end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  v_numero := 'DEV-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_retro := jsonb_build_array(
    jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
    jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
    jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, retro, nb_parts,
    options, prix_ht, acompte, statut, notes, cgv, agent_id)
  values (
    v_client, v_numero, trim(p_client_nom), nullif(trim(coalesce(p_telephone, '')), ''),
    p_date_event, v_retro, p_nb_parts, v_opts, p_prix_ht, 0, 'devis',
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cgv, false), v_auth)
  returning id into v_id;

  return jsonb_build_object('cake_id', v_id, 'numero', v_numero);
end;
$$;

revoke execute on function public.creer_cake(text, text, date, integer, numeric, jsonb, text, boolean) from public, anon;
grant execute on function public.creer_cake(text, text, date, integer, numeric, jsonb, text, boolean) to authenticated, service_role;

-- =====================================================================
-- RPC : evoluer_cake — paiements et transitions verrouillées
-- =====================================================================
create or replace function public.evoluer_cake(p_id uuid, p_transition text, p_montant numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
  v_paid numeric;
  v_new text;
  v_type text;
  v_montant numeric := nullif(p_montant, 0);
  v_req numeric;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_transition not in ('payer','confirme','produit','livre','annule') then
    raise exception 'Transition invalide.';
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;

  v_paid := coalesce(c.acompte, 0);

  if p_transition = 'payer' then
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Paiement impossible depuis le statut %.', c.statut;
    end if;
    if v_montant is null or v_montant <= 0 or v_montant > (c.prix_ht - v_paid) then
      raise exception 'Montant de paiement invalide.';
    end if;
    v_type := case when c.statut in ('devis','acompte') then 'acompte' else 'solde' end;
    update public.cakes k
      set acompte = v_paid + v_montant,
          paiements = coalesce(k.paiements, '[]'::jsonb) || jsonb_build_object(
            'at', now(), 'type', v_type, 'montant', v_montant, 'by', v_auth),
          statut = case when k.statut = 'devis' then 'acompte' else k.statut end
     where k.id = p_id
     returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'confirme' then
    if c.statut <> 'acompte' then
      raise exception 'Confirmation possible uniquement depuis l''acompte (statut actuel : %).', c.statut;
    end if;
    v_req := ceil(c.prix_ht * 30)::numeric / 100;
    if v_paid < v_req then
      raise exception 'Acompte insuffisant : au moins % HT requis (30 %%).', v_req;
    end if;
    update public.cakes k set statut = 'confirme' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'produit' then
    if c.statut <> 'confirme' then
      raise exception 'Production possible uniquement depuis confirmé (statut actuel : %).', c.statut;
    end if;
    update public.cakes k set statut = 'produit' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'livre' then
    if c.statut <> 'produit' then
      raise exception 'Livraison possible uniquement depuis produit (statut actuel : %).', c.statut;
    end if;
    if v_paid < c.prix_ht then
      raise exception 'Le solde doit etre entierement enregistre avant livraison.';
    end if;
    update public.cakes k set statut = 'livre' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  else -- annule
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Annulation impossible depuis le statut %.', c.statut;
    end if;
    update public.cakes k set statut = 'annule' where k.id = p_id returning k.statut into c;
    v_new := c.statut;
  end if;

  return jsonb_build_object(
    'statut', v_new,
    'paid', v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0),
    'balance', c.prix_ht - (v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0)));
end;
$$;

revoke execute on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;
