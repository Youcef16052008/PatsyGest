-- =====================================================================
-- Migration 14 — Cake Design complet : édition, preuve CGV, TVA, ticket.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * cakes.tva_pct / cgv_accepted_at / cgv_version : TVA configurable et
--     preuve d'acceptation des CGV horodatée + version
--   * editer_cake  : édition d'un devis (statut 'devis' uniquement —
--                    verrouillé ensuite), régénère le rétroplanning
--   * accepter_cgv : enregistre l'acceptation (tous les rôles, comme
--                    creer_cake)
--   * Paiements/transitions : déjà couverts par evoluer_cake (09).
--   * Ticket imprimable : UI (cake-ticket.tsx, format80 mm).
-- Rejouable.
-- =====================================================================

alter table public.cakes add column if not exists tva_pct numeric not null default 0;
alter table public.cakes add column if not exists cgv_accepted_at timestamptz;
alter table public.cakes add column if not exists cgv_version text;

create or replace function public.editer_cake(
  p_id uuid,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts int,
  p_prix_ht numeric,
  p_tva_pct numeric,
  p_notes text,
  p_options jsonb
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
  c record;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_nom text;
  v_cout numeric;
  v_min int;
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
  if p_tva_pct is null or p_tva_pct < 0 or p_tva_pct > 100 then
    raise exception 'TVA invalide (0 a 100).';
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
        raise exception 'Option : cout invalide.';
      end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.';
      end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  if c.statut <> 'devis' then
    raise exception 'Edition possible uniquement depuis le devis (statut actuel : %).', c.statut;
  end if;

  update public.cakes k set
    client_nom = trim(p_client_nom),
    telephone = nullif(trim(coalesce(p_telephone, '')), ''),
    date_event = p_date_event,
    retro = jsonb_build_array(
      jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
      jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
      jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false)),
    nb_parts = p_nb_parts,
    prix_ht = p_prix_ht,
    tva_pct = p_tva_pct,
    options = coalesce(nullif(v_opts, '[]'::jsonb), k.options),
    notes = nullif(trim(coalesce(p_notes, '')), '')
   where k.id = p_id
   returning k.numero, k.prix_ht, k.tva_pct into c;

  return jsonb_build_object('cake_id', p_id, 'numero', c.numero, 'prix_ht', c.prix_ht, 'tva_pct', c.tva_pct);
end;
$$;
revoke execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.accepter_cgv(p_id uuid, p_version text)
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
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_version is null or length(trim(p_version)) < 1 or length(trim(p_version)) > 50 then
    raise exception 'Version des CGV requise (50 max).';
  end if;
  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  update public.cakes k set
    cgv = true,
    cgv_accepted_at = now(),
    cgv_version = trim(p_version)
   where k.id = p_id;
  return jsonb_build_object('cake_id', p_id, 'cgv', true, 'version', trim(p_version));
end;
$$;
revoke execute on function public.accepter_cgv(uuid, text) from public, anon;
grant execute on function public.accepter_cgv(uuid, text) to authenticated, service_role;
