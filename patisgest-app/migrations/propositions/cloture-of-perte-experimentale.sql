-- EXPÉRIMENTATION LOCALE UNIQUEMENT — NE PAS DÉPLOYER.
-- Exemple limité à la perte de matière connue ; aucune réévaluation historique,
-- main-d'œuvre ou validation comptable. Ne fait pas partie du manifeste de
-- déploiement. À revoir après réconciliation du pilote et stratégie de rollback.
begin;

-- Ne pas enregistrer une perte sur une base qui continue à imputer la totalité
-- des matières à chaque clôture. Le brouillon 102 dépend lui-même de 101.
do $$
declare f regprocedure := to_regprocedure('public.patisgest_terminer_of_interne(uuid,numeric,text,date)');
begin
 if f is null or position('v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit' in pg_get_functiondef(f)) = 0 then
  raise exception 'Expérience : la correction de coût partiel attendue est absente.';
 end if;
end $$;

create table public.of_pertes_matiere_experimentales (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 of_id uuid not null unique references public.ordres_fabrication(id),
 quantite_perdue numeric(12,3) not null check (quantite_perdue > 0),
 montant_matiere numeric(12,2) not null check (montant_matiere >= 0),
 motif text not null check (length(trim(motif)) between 3 and 500),
 auteur_auth_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.of_pertes_matiere_experimentales enable row level security;
revoke all on public.of_pertes_matiere_experimentales from public, anon, authenticated;
grant select on public.of_pertes_matiere_experimentales to authenticated;
create policy pertes_lecture_proprietaire on public.of_pertes_matiere_experimentales
 for select to authenticated using (
  client_id = public.patisgest_mon_client() and public.patisgest_mon_role() = 'proprietaire'
 );

create function public.patisgest_clore_of_perte_experimentale(p_of_id uuid, p_motif text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_auth uuid := auth.uid(); v_client uuid; v_role text; v_of record; v_perte record;
 v_motif text := trim(coalesce(p_motif,'')); v_matiere numeric; v_quantite numeric; v_montant numeric;
begin
 if v_auth is null then raise exception 'Non authentifie.'; end if;
 perform public.patisgest_exiger_modules(array['production']);
 select u.client_id, u.role::text into v_client, v_role from public.utilisateurs u where u.auth_user_id=v_auth limit 1;
 if v_client is null or v_role is distinct from 'proprietaire' then raise exception 'Reserve au proprietaire.'; end if;
 if p_of_id is null or length(v_motif) not between 3 and 500 then raise exception 'OF et motif de perte obligatoires.'; end if;
 select o.* into v_of from public.ordres_fabrication o where o.id=p_of_id and o.client_id=v_client for update;
 if not found then raise exception 'OF introuvable.'; end if;
 select * into v_perte from public.of_pertes_matiere_experimentales p where p.of_id=p_of_id and p.client_id=v_client;
 if found then
  if v_perte.motif is distinct from v_motif then raise exception 'OF deja clos avec un motif different.'; end if;
  return jsonb_build_object('of_id',p_of_id,'perte_id',v_perte.id,'quantite_perdue',v_perte.quantite_perdue,'montant_matiere',v_perte.montant_matiere,'deja_enregistree',true);
 end if;
 if v_of.statut <> 'partiel' or v_of.qte_prevue <= 0 or v_of.qte_realisee <= 0 or v_of.qte_realisee >= v_of.qte_prevue then
  raise exception 'Seul un OF partiel avec production et reste peut etre clos en perte.';
 end if;
 if jsonb_typeof(v_of.consommations) is distinct from 'array' or jsonb_array_length(v_of.consommations)=0
    or jsonb_typeof(v_of.manquants) is distinct from 'array' or jsonb_array_length(v_of.manquants)>0 then
  raise exception 'Consommations inconnues ou manquantes : perte non chiffrable.';
 end if;
 if exists (select 1 from jsonb_array_elements(v_of.consommations) t(val)
   where jsonb_typeof(t.val->'qty') is distinct from 'number' or jsonb_typeof(t.val->'pu') is distinct from 'number'
      or (t.val->>'qty')::numeric <= 0 or (t.val->>'pu')::numeric <= 0) then
  raise exception 'Quantite ou prix de matiere inconnu : perte non chiffrable.';
 end if;
 select sum((t.val->>'qty')::numeric * (t.val->>'pu')::numeric) into v_matiere
  from jsonb_array_elements(v_of.consommations) t(val);
 -- Le brouillon 102 arrondit le coût unitaire des lots au centime. Sans
 -- réconciliation explicite des résidus, une fraction (1 DA / 3) fausserait
 -- silencieusement le total matière. Refuser plutôt qu'inventer une perte.
 if round(v_matiere / v_of.qte_prevue,2) * v_of.qte_prevue <> v_matiere then
  raise exception 'Arrondi matiere non resolu : cloture refusee.';
 end if;
 v_quantite := v_of.qte_prevue-v_of.qte_realisee;
 -- Une quantité fractionnaire peut créer un demi-centime même si le coût
 -- unitaire est exact. Ce refus ne réconcilie pas les arrondis multi-lots.
 if round(v_matiere*v_quantite/v_of.qte_prevue,2) <> v_matiere*v_quantite/v_of.qte_prevue then
  raise exception 'Arrondi matiere non resolu : cloture refusee.';
 end if;
 v_montant := round(v_matiere*v_quantite/v_of.qte_prevue,2);
 insert into public.of_pertes_matiere_experimentales(client_id,of_id,quantite_perdue,montant_matiere,motif,auteur_auth_id)
 values(v_client,p_of_id,v_quantite,v_montant,v_motif,v_auth) returning * into v_perte;
 update public.ordres_fabrication set statut='termine' where id=p_of_id and client_id=v_client;
 return jsonb_build_object('of_id',p_of_id,'perte_id',v_perte.id,'quantite_perdue',v_quantite,'montant_matiere',v_montant,'deja_enregistree',false);
end $$;
revoke all on function public.patisgest_clore_of_perte_experimentale(uuid,text) from public,anon,authenticated;
grant execute on function public.patisgest_clore_of_perte_experimentale(uuid,text) to authenticated,service_role;
commit;
