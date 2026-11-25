-- Migration 46 — Validation rapide du tiroir depuis le Dashboard + Pack Pâtisserie DZ
-- Additive only. Idempotente.

begin;

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
  v_bilan jsonb;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(coalesce(p_attendu, 0)::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + coalesce(p_attendu, 0)))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', 'dashboard_rapide',
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;

revoke execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

commit;
