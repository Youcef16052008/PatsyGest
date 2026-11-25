-- Migration 48 — Wave 3 & 4 : Photos produits (B.1) & justificatifs factures (B.4)
-- Additive only. Idempotente.

begin;

alter table public.articles
  add column if not exists photo_url text null;

alter table public.bons_commande
  add column if not exists facture_photo_url text null;

create or replace function public.sauver_photo_article(
  p_article_id uuid,
  p_photo_url text
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
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then raise exception 'Role non autorise.'; end if;
  if p_photo_url is not null and length(p_photo_url) > 350000 then
    raise exception 'Photo trop volumineuse (compressez avant envoi).';
  end if;

  update public.articles
     set photo_url = nullif(trim(coalesce(p_photo_url, '')), '')
   where id = p_article_id and client_id = v_client;

  if not found then raise exception 'Article introuvable.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.sauver_photo_article(uuid, text) from public, anon;
grant execute on function public.sauver_photo_article(uuid, text) to authenticated, service_role;

commit;
