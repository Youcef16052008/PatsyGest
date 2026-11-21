-- =====================================================================
-- 37 — Transfert idempotent (revue B-007 : client_ref sur les transferts).
--
-- Problème : un double clic, une resoumission ou un rejeu hors ligne
-- relancent transferer_article et déplacent deux fois le même stock.
-- Les ordres de fabrication sont déjà protégés (migration 16, client_ref).
--
-- Correction (sans modifier transferer_article, déjà appliquée) :
--   * transferts.client_ref, unique par client quand il est renseigné ;
--   * transferer_article_ref : même référence = rejeu, renvoie le transfert
--     existant sans rien déplacer ; même référence pour une autre demande =
--     refus explicite ; verrou consultatif pour que deux appels simultanés
--     ne déplacent pas deux fois. Tout se fait dans une seule transaction.
--
-- L'application ne l'appelle pas encore : elle reste sur transferer_article
-- tant que cette migration n'est pas appliquée au pilote. La version de schéma
-- est enregistrée à 37 (jamais abaissée) ; la requise côté app passera à 37
-- lorsque l'appel sera branché.
--
-- Rejouable. Gardes strictes : échoue si les prérequis sont absents.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transferts') then
    raise exception 'Migration 37 : table transferts absente (migration 08 requise).';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'transferer_article') then
    raise exception 'Migration 37 : transferer_article absente (migrations 08 et 21 requises).';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_schema_version') then
    raise exception 'Migration 37 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

alter table public.transferts add column if not exists client_ref text;

alter table public.transferts drop constraint if exists transferts_client_ref_longueur;
alter table public.transferts add constraint transferts_client_ref_longueur
  check (client_ref is null or length(client_ref) between 1 and 64);

create unique index if not exists transferts_client_ref_uniq
  on public.transferts (client_id, client_ref) where client_ref is not null;

create or replace function public.transferer_article_ref(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text,
  p_responsable text default null,
  p_client_ref text default null
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
  v_cle text := nullif(trim(coalesce(p_client_ref, '')), '');
  v_existant record;
  v_qte_existante numeric;
  v_article_present boolean;
  v_resultat jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if v_cle is not null and length(v_cle) > 64 then
    raise exception 'Référence de transfert trop longue (64 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  if v_cle is not null then
    -- Sérialise les appels de même référence : le second attend la fin du premier
    -- puis voit son transfert et le rejoue au lieu de déplacer le stock à nouveau.
    perform pg_advisory_xact_lock(hashtextextended(v_client::text || ':' || v_cle, 0));

    select t.id, t.ref, t.responsable, t.from_site_id, t.to_site_id, t.lignes
      into v_existant
      from public.transferts t
     where t.client_id = v_client and t.client_ref = v_cle;

    if found then
      select coalesce(sum((l->>'qty')::numeric), 0),
             coalesce(bool_or(l->>'articleId' = p_article_id::text), false)
        into v_qte_existante, v_article_present
        from jsonb_array_elements(v_existant.lignes) l;

      if v_existant.from_site_id is distinct from p_from_site_id
         or v_existant.to_site_id is distinct from p_to_site_id
         or not v_article_present
         or v_qte_existante is distinct from round(p_qte, 4) then
        raise exception 'Référence de transfert déjà utilisée pour un autre transfert.';
      end if;

      return jsonb_build_object(
        'transfert_id', v_existant.id,
        'ref', v_existant.ref,
        'responsable', v_existant.responsable,
        'lots', jsonb_array_length(v_existant.lignes),
        'qte', p_qte,
        'rejoue', true
      );
    end if;
  end if;

  -- Délègue au mouvement existant : même transaction, mêmes contrôles de stock et de DLC.
  v_resultat := public.transferer_article(
    p_article_id, p_from_site_id, p_to_site_id, p_qte, p_motif, p_responsable
  );

  if v_cle is not null then
    update public.transferts t set client_ref = v_cle
     where t.id = (v_resultat->>'transfert_id')::uuid;
  end if;

  return v_resultat || jsonb_build_object('rejoue', false);
end;
$$;

revoke all on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  to authenticated, service_role;

-- Version de schéma : enregistrée à 37, jamais abaissée (même mécanisme que la 35).
insert into public.app_schema_version (id, version)
values (1, 37)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

commit;
