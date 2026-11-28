-- =====================================================================
-- 40 — Journal d'audit « qui, quoi, quand » conservé 10 ans (NF-10, RI-06).
--
-- Problème : le cahier des charges v4.0 exige un journal d'audit sur ventes,
-- stocks, clôtures et connexions, conservé 10 ans (NF-10, §7 Sécurité, RI-06),
-- et la table `journal_audit` est décrite dans l'architecture (§4.1). Aucune
-- migration ne l'avait créée : le produit fonctionnait sans aucune trace
-- exploitable en cas de contrôle, de litige ou de rappel produit.
--
-- Propriétés garanties ici, et pourquoi chacune est nécessaire :
--
--   * IMMUABILITÉ — un journal qu'on peut réécrire ne prouve rien. Les rôles
--     applicatifs n'ont ni UPDATE ni DELETE, et un déclencheur refuse ces
--     opérations même pour le propriétaire de la table (protection contre une
--     erreur de code côté serveur, pas contre un superutilisateur).
--   * AUTORITÉ DE L'IDENTITÉ — acteur_id et client_id sont imposés par
--     `auth.uid()` / `patisgest_mon_client()`, jamais par le client HTTP.
--     Sans cela, n'importe qui pourrait signer une action au nom d'un autre.
--   * CONSERVATION 10 ANS — RI-06 interdit toute purge avant 10 ans ; le
--     déclencheur refuse un DELETE qui toucherait une ligne plus récente que
--     dix ans. (Le propriétaire de la base peut toujours tronquer manuellement :
--     aucune politique SQL ne protège d'un superutilisateur. C'est écrit ici
--     pour que personne ne croie à une garantie qu'on n'a pas donnée.)
--   * ISOLATION — lecture réservée au propriétaire du même client. Le labo et
--     le vendeur n'ont pas à lire l'historique global des actions du tenant.
--
-- Additive only. Ne modifie aucune migration déjà appliquée. Rejouable.
-- =====================================================================
begin;

do $garde$
begin
  if to_regclass('public.clients') is null then
    raise exception 'Migration 40 : table clients absente (migration 01 requise).';
  end if;
  if to_regclass('public.utilisateurs') is null then
    raise exception 'Migration 40 : table utilisateurs absente (migration 01 requise).';
  end if;
  if to_regprocedure('public.patisgest_mon_client()') is null then
    raise exception 'Migration 40 : patisgest_mon_client() absente (migration 05 requise).';
  end if;
end
$garde$;

-- ---------- Table ----------
-- `details` reste jsonb volontairement : le journal doit pouvoir enregistrer
-- une forme qui change (prix avant/après, quantités, motif) sans migration.
-- Aucune clé étrangère vers `utilisateurs` : supprimer un compte ne doit jamais
-- effacer l'historique de ses actions (l'email est donc conservé en texte).
create table if not exists public.journal_audit (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id),
  acteur_id    uuid,
  acteur_email text not null default 'inconnu',
  action       text not null,
  table_cible  text not null,
  ligne_id     uuid,
  details      jsonb not null default '{}'::jsonb,
  cree_le      timestamptz not null default now()
);

comment on table public.journal_audit is
  'Journal d''audit NF-10 : qui, quoi, quand. Immuable, isolation par tenant, conservation 10 ans (RI-06).';
comment on column public.journal_audit.acteur_email is
  'Copie de l''email au moment de l''action : survit à la suppression du compte.';
comment on column public.journal_audit.details is
  'Charge utile libre (avant/après, motif). Ne jamais y stocker de secret ni de coût fournisseur détaillé.';

create index if not exists journal_audit_client_date_idx
  on public.journal_audit (client_id, cree_le desc);
create index if not exists journal_audit_cible_idx
  on public.journal_audit (client_id, table_cible, ligne_id, cree_le desc);
create index if not exists journal_audit_acteur_idx
  on public.journal_audit (client_id, acteur_id, cree_le desc);

-- ---------- Immuabilité ----------
-- Déclencheur plutôt que simple absence de GRANT : un GRANT oublié sur une
-- base restaurée ou recréée doit échouer bruyamment, pas silencieusement.
create or replace function public.patisgest_journal_audit_immuable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent boolean;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Journal d''audit immuable : la ligne % ne peut pas être modifiée.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  -- DELETE : refusé dans tous les cas sur une ligne de moins de 10 ans (RI-06).
  -- Au-delà, seul un rôle de confiance (service_role / propriétaire) peut agir ;
  -- les rôles applicatifs n'ont de toute façon pas le privilège DELETE.
  select exists (
    select 1 from public.journal_audit j
     where j.id = old.id and j.cree_le > now() - interval '10 years'
  ) into v_recent;
  if v_recent then
    raise exception 'Journal d''audit immuable : purge interdite avant 10 ans (RI-06), ligne %.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end
$$;

drop trigger if exists journal_audit_immuable on public.journal_audit;
create trigger journal_audit_immuable
  before update or delete on public.journal_audit
  for each row execute function public.patisgest_journal_audit_immuable();

-- Une fonction de déclencheur n'a aucune raison d'être appelable en RPC.
-- Sans ces révocations, `anon` peut l'invoquer via PostgREST (test droits-execution).
revoke all on function public.patisgest_journal_audit_immuable() from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.journal_audit enable row level security;

revoke all on public.journal_audit from public, anon, authenticated;
-- Insertion réservée aux déclencheurs (SECURITY DEFINER). Aucun droit
-- d'écriture directe : sinon l'acteur pourrait fabriquer un faux événement.
-- Lecture : le propriétaire de son tenant, plus la service_role d'exploitation.
grant select on public.journal_audit to authenticated;

drop policy if exists journal_audit_lecture_proprietaire on public.journal_audit;
create policy journal_audit_lecture_proprietaire on public.journal_audit
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

-- ---------- Écriture par déclencheur ----------
-- Une seule fonction d'enregistrement, appelée par les déclencheurs cibles.
-- Elle impose l'identité depuis la session et ignore toute valeur fournie.
create or replace function public.patisgest_journaliser(
  p_client_id uuid,
  p_action text,
  p_table text,
  p_ligne_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := 'inconnu';
  v_uid   uuid := auth.uid();
begin
  if p_client_id is null then
    return; -- rien à rattacher (contexte de service) : on n'écrit pas de ligne orpheline
  end if;
  if v_uid is not null then
    select u.email into v_email from public.utilisateurs u where u.auth_user_id = v_uid limit 1;
  end if;
  insert into public.journal_audit (client_id, acteur_id, acteur_email, action, table_cible, ligne_id, details)
  values (p_client_id, v_uid, coalesce(v_email, 'inconnu'), p_action, p_table, p_ligne_id, coalesce(p_details, '{}'::jsonb));
exception
  when others then
    -- Invariant produit « alerte, jamais blocage » (RG-01.1) : une panne du
    -- journal ne doit pas annuler une vente. On journalise l'échec dans les
    -- journaux PostgreSQL pour qu'il soit visible à l'exploitation.
    raise warning 'journal_audit : écriture impossible pour %.% (action %) : %',
      p_table, coalesce(p_ligne_id::text, '-'), p_action, sqlerrm;
end
$$;

revoke all on function public.patisgest_journaliser(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------- Déclencheurs métier ----------
-- NF-10 nomme explicitement ventes, stocks, clôtures et connexions.

create or replace function public.patisgest_audit_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne record;
  v_client uuid;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_ligne := old;
  else
    v_ligne := new;
  end if;
  -- `client_id` est présent sur toutes les tables auditées (RI-01).
  execute format('select ($1).client_id') into v_client using v_ligne;
  -- On ne conserve pas les montants ni les coûts dans `details` : le journal
  -- ne doit pas devenir une seconde base de données financière lisible.
  if tg_op = 'INSERT' then
    v_details := jsonb_build_object('operation', 'INSERT');
  elsif tg_op = 'UPDATE' then
    v_details := jsonb_build_object('operation', 'UPDATE');
  else
    v_details := jsonb_build_object('operation', 'DELETE');
  end if;
  perform public.patisgest_journaliser(
    v_client,
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    v_ligne.id,
    v_details
  );
  return coalesce(new, old);
end
$$;

-- Idem pour la fonction de déclencheur métier : elle ne doit pas être exposée
-- comme RPC. `postgres` conserve EXECUTE, donc les déclencheurs fonctionnent.
revoke all on function public.patisgest_audit_ligne() from public, anon, authenticated;

do $declencheurs$
declare
  v_table text;
begin
  foreach v_table in array array['ventes', 'mouvements', 'clotures', 'ordres_fabrication', 'articles', 'lots'] loop
    if to_regclass('public.' || v_table) is null then
      continue; -- tableau absent sur une base partielle : ne pas bloquer la migration
    end if;
    execute format('drop trigger if exists audit_%1$s on public.%1$I;', v_table);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.patisgest_audit_ligne();',
      v_table
    );
  end loop;
end
$declencheurs$;

-- Connexions / changements de rôle : la table utilisateurs porte l'arrivée d'un
-- compte et les changements de rôle (c'est là qu'un droit est accordé). Les
-- vraies connexions Auth vivent chez Supabase ; on trace ce qui est auditable
-- depuis le schéma public, et on ne prétend pas faire plus.
drop trigger if exists audit_utilisateurs on public.utilisateurs;
create trigger audit_utilisateurs
  after insert or update of role on public.utilisateurs
  for each row execute function public.patisgest_audit_ligne();

-- ---------- Version de schéma ----------
insert into public.app_schema_version (id, version)
values (1, 40)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

commit;

-- ------------------------------------------------ vérification (lecture seule)
--   select tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where not t.tgisinternal and t.tgname like 'audit_%' order by 2;
--   select count(*) from public.journal_audit;           -- doit croître après une vente
--   update public.journal_audit set action = 'x';        -- doit échouer (immuable)
