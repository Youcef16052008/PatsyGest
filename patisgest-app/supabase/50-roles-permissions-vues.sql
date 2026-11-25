-- Migration 50 — Activation et verrouillage strict des 3 rôles (propriétaire, labo, vendeur)
-- Promut les 9 vues sans colonnes financières dans le chemin déployable et applique
-- les 5 règles métier validées :
--   1. Vendeur sur Commandes & Gâteaux : encaisser/livrer uniquement (pas de création/édition de devis chiffrés).
--   2. Vendeur sur Carnet de Crédits : ajouter & encaisser ; annulation/modification/suppression réservées au propriétaire.
--   3. Vendeur sur Clôture : comptage tiroir en mode aveugle (sans écart ni attendu dans la réponse).
--   4. Labo : proposition de prix vers notifications_patron (articles créés à pv_ht=0 jusqu'à validation patron) ;
--      aucun accès caisse, clôture, crédits, avoirs, import Z, paramètres de coûts ou suppression de recettes.
--   5. Révocation systématique PUBLIC/anon sur toutes les fonctions et vues.
-- Idempotente (compatible base fraîche et base pilote déjà partiellement patchée).

begin;

-- ---------------------------------------------------------------------------
-- 1. Affectations de sites et gardes de périmètre
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_sites (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  primary key (utilisateur_id, site_id)
);
alter table public.equipe_sites enable row level security;
revoke all on public.equipe_sites from public, anon, authenticated;

create or replace function public.patisgest_site_autorise(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
      from public.utilisateurs u
      join public.sites s on s.id = p_site and s.client_id = u.client_id
     where u.auth_user_id = auth.uid()
       and (
         u.role = 'proprietaire'
         or (
           u.role in ('labo', 'vendeur')
           and (u.role <> 'vendeur' or s.type = 'boutique')
           and exists(
             select 1 from public.equipe_sites a
              where a.utilisateur_id = u.id and a.site_id = s.id
           )
         )
       )
  )
$$;
revoke all on function public.patisgest_site_autorise(uuid) from public, anon;
grant execute on function public.patisgest_site_autorise(uuid) to authenticated, service_role;

create or replace function public.patisgest_tous_sites_autorises()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.role = 'proprietaire' then true
      else exists(select 1 from public.sites s where s.client_id = u.client_id)
       and not exists(
         select 1 from public.sites s
          where s.client_id = u.client_id and not public.patisgest_site_autorise(s.id)
       )
    end
    from public.utilisateurs u
    where u.auth_user_id = auth.uid()
    limit 1
  ), false)
$$;
revoke all on function public.patisgest_tous_sites_autorises() from public, anon;
grant execute on function public.patisgest_tous_sites_autorises() to authenticated, service_role;

create or replace function public.patisgest_exiger_tous_sites()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.patisgest_tous_sites_autorises() then
    raise exception 'Acces indisponible sans attribution de tous les sites.' using errcode = '42501';
  end if;
end
$$;
revoke all on function public.patisgest_exiger_tous_sites() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policies restrictives & 9 vues sans colonnes financières (labo + vendeur)
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'articles','lots','mouvements','recette_versions','ordres_fabrication',
    'cakes','ventes','clotures','transferts','bons_commande',
    'historique_prix','parametres_couts','z_imports'
  ] loop
    execute format('drop policy if exists labo_sans_finance on public.%I', t);
    execute format(
      'create policy labo_sans_finance on public.%I as restrictive for select to authenticated using (public.patisgest_mon_role() <> %L)',
      t, 'labo'
    );
  end loop;
end $$;

drop policy if exists labo_sans_parametres_couts_insert on public.parametres_couts;
create policy labo_sans_parametres_couts_insert on public.parametres_couts
  as restrictive for insert to authenticated
  with check (public.patisgest_mon_role() = 'proprietaire');

drop policy if exists labo_sans_parametres_couts_update on public.parametres_couts;
create policy labo_sans_parametres_couts_update on public.parametres_couts
  as restrictive for update to authenticated
  using (public.patisgest_mon_role() = 'proprietaire')
  with check (public.patisgest_mon_role() = 'proprietaire');

drop policy if exists vendeur_sans_lots_bruts on public.lots;
create policy vendeur_sans_lots_bruts on public.lots
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

drop policy if exists vendeur_sans_mouvements_bruts on public.mouvements;
create policy vendeur_sans_mouvements_bruts on public.mouvements
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

drop policy if exists vendeur_sans_of_bruts on public.ordres_fabrication;
create policy vendeur_sans_of_bruts on public.ordres_fabrication
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

create or replace view public.labo_articles with (security_barrier = true) as
  select id, client_id, code, nom, niveau, unite, seuil, allergenes, traces, created_at
    from public.articles
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('transferts')
       or public.patisgest_module_autorise('tracabilite')
       or public.patisgest_module_autorise('achats')
       or public.patisgest_module_autorise('cake-design')
       or public.patisgest_module_autorise('qualite')
     );

create or replace view public.labo_lots with (security_barrier = true) as
  select id, client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest,
         dlc, date_reception, ref, congele, bloque, created_at, bloque_motif
    from public.lots
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('transferts')
       or public.patisgest_module_autorise('tracabilite')
       or public.patisgest_module_autorise('achats')
       or public.patisgest_module_autorise('cake-design')
       or public.patisgest_module_autorise('qualite')
     );

create or replace view public.labo_recette_versions with (security_barrier = true) as
  select v.id, v.client_id, v.famille_id, v.version, v.rendement_qte, v.rendement_unite,
         v.cuisson_perte_pct, v.mo_min, v.active, v.created_at,
         coalesce((
           select jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'articleId', case when jsonb_typeof(x.val->'articleId') = 'string' then x.val->>'articleId' end,
               'code', case when jsonb_typeof(x.val->'code') = 'string' and length(x.val->>'code') <= 40 then x.val->>'code' end,
               'subVersionId', case when jsonb_typeof(x.val->'subVersionId') = 'string' then x.val->>'subVersionId' end,
               'q', case when jsonb_typeof(x.val->'q') = 'number' then x.val->'q' end,
               'u', case when jsonb_typeof(x.val->'u') = 'string' then x.val->>'u' end,
               'parage', case when jsonb_typeof(x.val->'parage') = 'number' then x.val->'parage' end
             ))
             order by x.pos
           )
           from jsonb_array_elements(case when jsonb_typeof(v.ingredients) = 'array' then v.ingredients else '[]'::jsonb end) with ordinality x(val, pos)
         ), '[]'::jsonb) as ingredients
    from public.recette_versions v
   where v.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and (
       public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
     );

create or replace view public.labo_ventes_quantites with (security_barrier = true) as
  select v.id, v.client_id, v.site_id, v.date_vente, v.source,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'articleId', case when jsonb_typeof(x.val->'articleId') = 'string' and x.val->>'articleId' ~* '^[0-9a-f-]{36}$' then x.val->>'articleId' end,
               'qty', case when jsonb_typeof(x.val->'qty') = 'number' then x.val->'qty' end
             )
             order by x.pos
           )
           from jsonb_array_elements(case when jsonb_typeof(v.lignes) = 'array' then v.lignes else '[]'::jsonb end) with ordinality x(val, pos)
         ), '[]'::jsonb) as lignes
    from public.ventes v
   where v.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(v.site_id)
     and public.patisgest_module_autorise('planning');

create or replace view public.labo_ordres_fabrication with (security_barrier = true) as
  select id, client_id, famille_id, version_id, site_id, numero, qte_prevue, qte_realisee,
         date_prevue, date_lancement, statut, client_ref,
         jsonb_build_object('recette', snapshot->>'recette', 'version', snapshot->>'version', 'devis', snapshot->>'devis') as snapshot,
         created_at
    from public.ordres_fabrication
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning'));

create or replace view public.labo_cakes with (security_barrier = true) as
  select id, client_id, numero, client_nom, telephone, date_event, nb_parts, statut,
         cgv, version_id, site_id, qte_fabrication, of_id, created_at
    from public.cakes
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (public.patisgest_module_autorise('cake-design') or public.patisgest_module_autorise('planning'));

create or replace view public.labo_bons_commande with (security_barrier = true) as
  select b.id, b.client_id, b.fournisseur_id, b.numero, b.date_bc, b.statut, b.created_at,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'articleId', case when jsonb_typeof(l.v->'articleId') = 'string' and l.v->>'articleId' ~* '^[0-9a-f-]{36}$' then l.v->>'articleId' else null end,
               'qte', case when jsonb_typeof(l.v->'qte') = 'number' then l.v->'qte' else null end,
               'recu', case when jsonb_typeof(l.v->'recu') = 'number' then l.v->'recu' else null end
             )
             order by l.ord
           )
           from jsonb_array_elements(case when jsonb_typeof(b.lignes) = 'array' then b.lignes else '[]'::jsonb end) with ordinality as l(v, ord)
         ), '[]'::jsonb) as lignes
    from public.bons_commande b
   where b.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_tous_sites_autorises()
     and public.patisgest_module_autorise('achats');

create or replace view public.vendeur_lots with (security_barrier = true) as
  select l.id, l.client_id, l.article_id, l.site_id, l.numero, l.qte_init, l.qte_rest,
         l.dlc, l.date_reception, l.ref, l.congele, l.bloque, l.bloque_motif, l.created_at
    from public.lots l
   where l.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'vendeur'
     and public.patisgest_site_autorise(l.site_id)
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('caisse')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('qualite')
       or public.patisgest_module_autorise('tracabilite')
     );

create or replace view public.vendeur_ordres_fabrication with (security_barrier = true) as
  select o.id, o.client_id, o.site_id, o.numero, o.qte_prevue, o.qte_realisee,
         o.date_prevue, o.date_lancement, o.statut, o.created_at,
         jsonb_strip_nulls(jsonb_build_object(
           'recette', case when jsonb_typeof(o.snapshot->'recette') = 'string' then o.snapshot->'recette' end,
           'version', case when jsonb_typeof(o.snapshot->'version') = 'number' then o.snapshot->'version' end,
           'devis', case when jsonb_typeof(o.snapshot->'devis') = 'string' then o.snapshot->'devis' end
         )) as snapshot
    from public.ordres_fabrication o
   where o.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'vendeur'
     and public.patisgest_site_autorise(o.site_id)
     and (
       public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('cake-design')
     );

revoke all on public.labo_articles, public.labo_lots, public.labo_recette_versions,
  public.labo_ordres_fabrication, public.labo_cakes, public.labo_bons_commande,
  public.labo_ventes_quantites, public.vendeur_lots, public.vendeur_ordres_fabrication
  from public, anon;
grant select on public.labo_articles, public.labo_lots, public.labo_recette_versions,
  public.labo_ordres_fabrication, public.labo_cakes, public.labo_bons_commande,
  public.labo_ventes_quantites, public.vendeur_lots, public.vendeur_ordres_fabrication
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Règle 4 (Option B) : Labo ne peut pas fixer de prix de vente sur articles
--    ni supprimer de recettes libres ; validation patron met à jour l'article.
-- ---------------------------------------------------------------------------
create or replace function public.patisgest_articles_labo_sans_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.patisgest_mon_role() = 'labo' then
    new.pv_ht := 0;
    new.tva := 0;
  end if;
  return new;
end
$$;
revoke all on function public.patisgest_articles_labo_sans_prix() from public, anon, authenticated;

drop trigger if exists trg_articles_labo_sans_prix on public.articles;
create trigger trg_articles_labo_sans_prix
  before insert or update on public.articles
  for each row execute function public.patisgest_articles_labo_sans_prix();

drop policy if exists recettes_libres_delete on public.recettes_libres;
create policy recettes_libres_delete on public.recettes_libres
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

drop policy if exists recettes_libres_insert on public.recettes_libres;
create policy recettes_libres_insert on public.recettes_libres
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or (public.patisgest_mon_role() = 'labo' and statut_prix = 'a_verifier_patron')
    )
  );

drop policy if exists recettes_libres_update on public.recettes_libres;
create policy recettes_libres_update on public.recettes_libres
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or (public.patisgest_mon_role() = 'labo' and statut_prix = 'a_verifier_patron')
    )
  );

create or replace function public.traiter_alerte_prix_patron(
  p_alerte_id uuid,
  p_decision text,
  p_nouveau_prix numeric default null
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
  v_row public.notifications_patron%rowtype;
  v_prix_final numeric(12,2);
  v_uuid uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Reserve au proprietaire.'; end if;
  if p_decision not in ('approuve', 'corrige', 'bloque') then
    raise exception 'Decision invalide.';
  end if;

  select * into v_row
    from public.notifications_patron
   where id = p_alerte_id and client_id = v_client
   for update;
  if not found then raise exception 'Notification introuvable.'; end if;

  if p_decision = 'corrige' then
    if p_nouveau_prix is null or p_nouveau_prix <= 0 then
      raise exception 'Nouveau prix positif requis.';
    end if;
    v_prix_final := round(p_nouveau_prix::numeric, 2);
  elsif p_decision = 'approuve' then
    v_prix_final := v_row.prix_saisi_da;
  else
    v_prix_final := null;
  end if;

  update public.notifications_patron
     set traite_statut = p_decision,
         prix_final_da = v_prix_final,
         traite_par = v_auth,
         traite_at = now()
   where id = v_row.id;

  if v_row.cible_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := v_row.cible_id::uuid;
    if v_row.cible_type = 'recette_libre' and to_regclass('public.recettes_libres') is not null then
      update public.recettes_libres
         set prix_vente_da = coalesce(v_prix_final, prix_vente_da),
             statut_prix = case when p_decision = 'bloque' then 'bloque' else 'valide' end,
             updated_at = now()
       where id = v_uuid and client_id = v_client;
    elsif v_row.cible_type in ('article', 'nouveau_produit') then
      if p_decision = 'bloque' then
        update public.articles set pv_ht = 0 where id = v_uuid and client_id = v_client;
      elsif v_prix_final is not null and v_prix_final > 0 then
        update public.articles
           set pv_ht = round(v_prix_final / (1 + coalesce(tva, 0) / 100.0), 2)
         where id = v_uuid and client_id = v_client;
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'statut', p_decision, 'prix_final_da', v_prix_final);
end;
$$;
revoke all on function public.traiter_alerte_prix_patron(uuid, text, numeric) from public, anon;
grant execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Règle 2 : Carnet de crédits (Vendeur ajoute & encaisse ; Patron seul modifie/annule/supprime)
-- ---------------------------------------------------------------------------
drop policy if exists credits_clients_select on public.credits_clients;
create policy credits_clients_select on public.credits_clients
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_insert on public.credits_clients;
create policy credits_clients_insert on public.credits_clients
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_update on public.credits_clients;
create policy credits_clients_update on public.credits_clients
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

drop policy if exists credits_clients_delete on public.credits_clients;
create policy credits_clients_delete on public.credits_clients
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

-- ---------------------------------------------------------------------------
-- 5. Règle 3 : Clôture tiroir aveugle pour le vendeur, bloquée pour le labo
-- ---------------------------------------------------------------------------
create or replace function public.valider_tiroir_jour(
  p_date date,
  p_site_id uuid,
  p_fond_initial numeric,
  p_especes_comptees numeric,
  p_attendu numeric default 0,
  p_note text default ''
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
  v_revision int;
  v_attendu_effectif numeric;
  v_bilan jsonb;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Comptage tiroir reserve au comptoir.' using errcode = '42501';
  end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;
  if not public.patisgest_site_autorise(p_site_id) then
    raise exception 'Site non autorise.' using errcode = '42501';
  end if;

  if v_role = 'vendeur' then
    select coalesce(sum(v.total_ttc), 0) into v_attendu_effectif
      from public.ventes v
     where v.client_id = v_client
       and v.site_id = p_site_id
       and v.date_vente = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';
  else
    v_attendu_effectif := coalesce(p_attendu, 0);
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(v_attendu_effectif::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + v_attendu_effectif))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', case when v_role = 'vendeur' then 'vendeur_aveugle' else 'dashboard_rapide' end,
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  if v_role = 'vendeur' then
    return jsonb_build_object('id', v_id, 'revision', v_revision, 'blind', true);
  end if;
  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;
revoke all on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Règles 1 & 4 sur les RPC SECURITY DEFINER (cakes, caisse, clôture, avoirs)
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  def text;
  injected text;
begin
  -- 6a. creer_cake & editer_cake : seul le propriétaire fixe ou modifie le prix d'un devis.
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('creer_cake', 'editer_cake')
       and p.prosecdef
  loop
    def := f.src;
    if def not like '%Creation reservee au proprietaire%' then
      injected := regexp_replace(
        def,
        E'\\mbegin\\M',
        'begin if public.patisgest_mon_role() <> ''proprietaire'' then raise exception ''Creation reservee au proprietaire.'' using errcode = ''42501''; end if;',
        'i'
      );
      if injected = def then raise exception 'Garde impossible sur %', f.proname; end if;
      execute injected;
    end if;
  end loop;

  -- 6b. evoluer_cake : vendeur = payer/confirme/livre uniquement ; labo = produit uniquement.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'patisgest_evoluer_cake_interne'
  ) then
    alter function public.evoluer_cake(uuid, text, numeric) rename to patisgest_evoluer_cake_interne;
    revoke all on function public.patisgest_evoluer_cake_interne(uuid, text, numeric) from public, anon, authenticated;
  end if;

  -- 6c. vendre_article, vendre_panier, importer_z, enregistrer_avoir : interdits au rôle labo.
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('vendre_article', 'vendre_panier', 'importer_z', 'enregistrer_avoir')
       and p.prosecdef
  loop
    def := f.src;
    if def not like '%Reserve au comptoir%' then
      injected := regexp_replace(
        def,
        E'\\mbegin\\M',
        'begin if public.patisgest_mon_role() = ''labo'' then raise exception ''Reserve au comptoir.'' using errcode = ''42501''; end if;',
        'i'
      );
      if injected = def then raise exception 'Garde impossible sur %', f.proname; end if;
      execute injected;
    end if;
  end loop;

  -- 6d. saisir_cloture (clôture financière globale) : réservée au propriétaire.
  select p.oid, pg_get_functiondef(p.oid) as src into f
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'saisir_cloture' and p.prosecdef
   limit 1;
  if found and f.src not like '%Reserve au proprietaire%' then
    injected := regexp_replace(
      f.src,
      E'\\mbegin\\M',
      'begin if public.patisgest_mon_role() <> ''proprietaire'' then raise exception ''Reserve au proprietaire.'' using errcode = ''42501''; end if;',
      'i'
    );
    if injected <> f.src then execute injected; end if;
  end if;

  -- 6e. terminer_of : masquer cout_unitaire et cout_estime pour le labo (si pas déjà encapsulé par 101).
  if to_regprocedure('public.patisgest_terminer_of_interne(uuid,numeric,text,date)') is null
     and to_regprocedure('public.terminer_of(uuid,numeric,text,date)') is not null then
    alter function public.terminer_of(uuid, numeric, text, date) rename to patisgest_terminer_of_interne;
    revoke all on function public.patisgest_terminer_of_interne(uuid, numeric, text, date) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.terminer_of(
  p_of_id uuid,
  p_qte numeric,
  p_numero_lot text,
  p_dlc date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := public.patisgest_terminer_of_interne(p_of_id, p_qte, p_numero_lot, p_dlc);
  if public.patisgest_mon_role() = 'labo' then
    r := r - 'cout_unitaire' - 'cout_estime';
  end if;
  return r;
end
$$;
revoke all on function public.terminer_of(uuid, numeric, text, date) from public, anon;
grant execute on function public.terminer_of(uuid, numeric, text, date) to authenticated, service_role;

create or replace function public.evoluer_cake(
  p_id uuid,
  p_transition text,
  p_montant numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.patisgest_mon_role();
  r jsonb;
begin
  if v_role = 'labo' and p_transition <> 'produit' then
    raise exception 'Transition reservee au comptoir.' using errcode = '42501';
  end if;
  if v_role = 'vendeur' and p_transition not in ('payer', 'confirme', 'livre') then
    raise exception 'Transition reservee au proprietaire.' using errcode = '42501';
  end if;
  r := public.patisgest_evoluer_cake_interne(p_id, p_transition, p_montant);
  if v_role = 'labo' then
    r := r - 'paid' - 'balance';
  end if;
  return r;
end
$$;
revoke all on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Version du schéma
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version) values (1, 50)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

commit;
