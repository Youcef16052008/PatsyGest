-- Migration 42 — Loi 18-07 : export et anonymisation des données personnelles.
--
-- Les mentions légales du produit promettent « un export et une suppression sur
-- demande sont possibles ». Rien ne permettait de tenir cette promesse : c'était
-- une phrase, pas une fonctionnalité. La loi 18-07 impose pourtant :
--   * le droit d'accès (savoir ce qui est détenu sur une personne) ;
--   * le droit d'opposition / d'effacement.
--
-- Décision structurante : **on anonymise, on ne supprime pas.**
--
-- Une vente est une écriture comptable conservée 10 ans (code de commerce,
-- RI-06). La détruire au motif d'une demande individuelle créerait une faute
-- comptable. La loi 18-07 ne demande d'ailleurs pas la destruction des
-- écritures : elle demande qu'on ne puisse plus identifier la personne. On
-- remplace donc les données identifiantes par une référence d'anonymisation,
-- et les montants, dates et liens restent intacts pour la comptabilité et la
-- traçabilité produit (rappel de lot).
--
-- Ce qui n'est jamais touché :
--   * `journal_audit` — le réécrire reviendrait à effacer l'historique d'accès
--     aux données qu'on prétend protéger ;
--   * les montants, dates, lots, quantités — non identifiants.

-- ------------------------------------------------------------ journal des demandes
-- Toute demande doit être traçable : qui a demandé quoi, quand, et pourquoi.
-- Sans ce registre, l'entreprise ne peut pas répondre à un contrôle.
create table if not exists public.demandes_donnees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  reference text not null,
  type text not null check (type in ('export', 'anonymisation')),
  motif text not null check (length(btrim(motif)) between 3 and 500),
  -- Portée : une commande précise ou l'ensemble des données d'une personne.
  cible text,
  lignes_affectees integer not null default 0,
  acteur_id uuid,
  cree_le timestamptz not null default now(),
  unique (client_id, reference)
);

alter table public.demandes_donnees enable row level security;

drop policy if exists demandes_donnees_lecture on public.demandes_donnees;
create policy demandes_donnees_lecture on public.demandes_donnees
  for select using (client_id = public.patisgest_mon_client()
                    and public.patisgest_mon_role() = 'proprietaire');

revoke all on public.demandes_donnees from public, anon, authenticated;
grant select on public.demandes_donnees to authenticated;

-- ------------------------------------------------------------ export (droit d'accès)
create or replace function public.exporter_donnees_personnelles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_out jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  -- Export complet de l'établissement : réservé au propriétaire. Un vendeur
  -- n'a pas à extraire la base clients pour l'emporter ailleurs.
  if v_role <> 'proprietaire' then
    raise exception 'Export reserve au proprietaire.';
  end if;

  -- Ne sortent que les champs identifiants. Les montants, statuts et dates
  -- restent dans l'export : sans eux, la personne ne peut pas vérifier que le
  -- document est bien le sien.
  select jsonb_build_object(
    'genere_le', now(),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'client_nom', c.client_nom,
        'telephone', c.telephone,
        'date_evenement', c.date_event,
        'parts', c.nb_parts,
        'montant_ht', c.prix_ht,
        'statut', c.statut
      ) order by c.date_event desc)
        from public.cakes c where c.client_id = v_client
    ), '[]'::jsonb),
    'comptes_utilisateurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'role', u.role,
        'cree_le', u.created_at
      ) order by u.created_at)
        from public.utilisateurs u where u.client_id = v_client
    ), '[]'::jsonb)
  ) into v_out;

  -- La référence doit être unique par tenant. `now()` est figé pour toute la
  -- transaction : deux exports dans la même transaction (ou la même seconde)
  -- produisaient la même référence et le second échouait sur la contrainte
  -- unique — un export refusé pour une raison qui n'a rien à voir avec le droit
  -- d'accès demandé. On ajoute un suffixe tiré au hasard, et un `on conflict`
  -- en filet de sécurité : perdre une ligne de registre n'est pas grave,
  -- refuser un export à une personne qui exerce son droit l'est.
  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client,
          'EXP-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          'export',
          'Export des donnees personnelles de l etablissement', 'etablissement',
          jsonb_array_length(coalesce(v_out->'commandes', '[]'::jsonb)), v_auth)
  on conflict (client_id, reference) do nothing;

  return v_out;
end;
$fn$;

revoke all on function public.exporter_donnees_personnelles() from public, anon;
grant execute on function public.exporter_donnees_personnelles() to authenticated;

-- ------------------------------------------------------------ anonymisation
create or replace function public.anonymiser_client(
  p_numero_commande text,
  p_motif text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_numero text := btrim(coalesce(p_numero_commande, ''));
  v_touche integer := 0;
  v_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Anonymisation reservee au proprietaire.';
  end if;
  if length(v_motif) < 3 then
    raise exception 'Motif obligatoire.';
  end if;
  if length(v_ref) < 3 then
    raise exception 'Reference de la demande obligatoire.';
  end if;
  if v_numero = '' then
    raise exception 'Commande a anonymiser obligatoire.';
  end if;

  -- Le remplacement garde une trace lisible : on doit pouvoir constater
  -- l'anonymisation sans pouvoir remonter à la personne.
  update public.cakes c
     set client_nom = 'Client anonymise (' || v_ref || ')',
         telephone = null
   where c.client_id = v_client and c.numero = v_numero;
  get diagnostics v_n = row_count;
  v_touche := v_touche + v_n;
  if v_n = 0 then
    raise exception 'Commande introuvable.';
  end if;

  -- Les tickets de vente ne portent pas de nom client : le ticket est anonyme
  -- par construction (`ventes.lignes` ne contient que des articles). Il n'y a
  -- donc qu'une seule table à nettoyer pour une commande — `cakes`, qui sert
  -- à la fois le comptoir et les commandes venues de la vitrine (migration 27).

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, v_numero, v_touche, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  -- Trace explicite. Les déclencheurs de la migration 40 journalisent les
  -- écritures ligne à ligne, mais pas l'INTENTION : « qui a demandé
  -- l'effacement, pour quel motif, sous quelle référence ». Une anonymisation
  -- sans cette trace est indistinguable, en audit, d'une perte de données.
  --
  -- Le bloc `execute` est utilisé volontairement : si la migration 40 n'est pas
  -- appliquée, `patisgest_journaliser` n'existe pas et un appel direct ferait
  -- échouer la COMPILATION de cette fonction, pas seulement l'exécution. Un
  -- `execute` diffère la résolution et laisse l'anonymisation fonctionner.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION');
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_touche,
    'commandes_conservees', (select count(*) from public.cakes where client_id = v_client),
    'ventes_conservees', (select count(*) from public.ventes where client_id = v_client)
  );
end;
$fn$;

revoke all on function public.anonymiser_client(text, text, text) from public, anon;
grant execute on function public.anonymiser_client(text, text, text) to authenticated;

-- ------------------------------------------------------------ audit
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_demandes_donnees on public.demandes_donnees;
    create trigger audit_demandes_donnees
      after insert or update or delete on public.demandes_donnees
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

insert into public.app_schema_version (id, version) values (1, 42)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);
