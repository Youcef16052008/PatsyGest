        v_vendu, v_deja;
    end if;
  end;

  -- ---- devenir de la marchandise ----
  if p_mode = 'remise_en_stock' then
    -- Lot d'origine : celui de la vente, s'il existe encore et appartient au
    -- tenant. On ne remet pas en stock un lot d'un autre site.
    -- Attention à la structure : `lignes[].lots[]` porte {lotId, numero, qty},
    -- ce n'est PAS un champ de la ligne (bug évité ici, verrouillé par test).
    select (lot->>'lotId')::uuid into v_lot_id
      from jsonb_array_elements(v_vente.lignes) l,
           lateral jsonb_array_elements(coalesce(l->'lots', '[]'::jsonb)) lot
     where (l->>'articleId')::uuid = v_article.id
     limit 1;
    if v_lot_id is not null then
      perform 1 from public.lots l
       where l.id = v_lot_id and l.client_id = v_client and l.site_id = v_vente.site_id;
      if not found then
        v_lot_id := null;
      end if;
    end if;

    if v_lot_id is not null then
      update public.lots l
         set qte_rest = l.qte_rest + v_qte
       where l.id = v_lot_id;
    else
      -- Lot de retour dédié : traçable, isolé de la production du jour.
      v_numero := 'RET-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
                  substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
      insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception, ref)
      values (v_client, v_article.id, v_vente.site_id, v_numero, v_qte, v_qte, 0, current_date, 'Retour client')
      returning id into v_lot_id;
      v_lot_cree := true;
    end if;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, v_lot_id, v_vente.site_id, 'avoir_remise', v_qte, 0,
            p_vente_id::text, 'Retour client : ' || v_motif);
  else
    -- Destruction : sortie de stock à hauteur du retour, pour que la perte
    -- reste mesurable. Aucun lot n'est recréé.
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, null, v_vente.site_id, 'avoir_destruction', -v_qte, 0,
            p_vente_id::text, 'Destruction : ' || v_motif);
  end if;

  -- ---- montants ----
  -- Prix unitaire et TVA issus de la ligne de vente d'origine, pas des prix
  -- du jour : un avoir rembourse ce qui a ete encaisse, pas ce que coute
  -- aujourd'hui le meme produit.
  select coalesce((l->>'pu')::numeric, 0), coalesce((l->>'tva')::numeric, 0)
    into v_pu, v_tva
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id
   limit 1;
  v_pu := coalesce(v_pu, 0);
  v_tva := coalesce(v_tva, 0);
  v_ht := round(v_qte * v_pu, 2);
  v_ttc := round(v_ht * (1 + v_tva / 100), 2);

  -- ---- enregistrement de l'avoir ----
  v_numero := 'AV-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
              substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
  insert into public.avoirs (client_id, vente_id, site_id, article_id, numero, qte, mode, motif,
                             pu_ht, tva_pct, total_ht, total_ttc,
                             lot_id, lot_retour_cree, acteur_id, acteur_email)
  values (v_client, v_vente.id, v_vente.site_id, v_article.id, v_numero, v_qte, p_mode, v_motif,
          v_pu, v_tva, v_ht, v_ttc,
          v_lot_id, v_lot_cree, v_auth, v_email)
  returning id into v_avoir;

  return jsonb_build_object(
    'avoir_id', v_avoir,
    'numero', v_numero,
    'mode', p_mode,
    'qte', v_qte,
    'total_ht', v_ht,
    'total_ttc', v_ttc,
    'article', v_article.nom,
    'lot_id', v_lot_id,
    'lot_retour_cree', v_lot_cree
  );
end;
$fn$;

revoke all on function public.enregistrer_avoir(uuid, text, text, numeric) from public, anon;
grant execute on function public.enregistrer_avoir(uuid, text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------- audit
-- La table `avoirs` entre dans la liste auditée par la migration 40, avec les
-- mêmes garanties (identité issue de la session, ligne immuable).
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_avoirs on public.avoirs;
    create trigger audit_avoirs
      after insert or update or delete on public.avoirs
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 41)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 42-donnees-personnelles.sql =====
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

-- ===== 43-unicite-lot.sql =====
-- Migration 43 — RI-04 : identité du lot, et non « unicité du numéro ».
--
-- La question ouverte était : faut-il `unique (client_id, numero)` sur `lots` ?
--
-- Réponse : non, et cette contrainte casserait une fonctionnalité livrée.
-- `transferer_article` (migration 08) crée volontairement un lot miroir sur le
-- site d'arrivée avec le MÊME numéro : un transfert déplace le lot, il n'en
-- crée pas un nouveau. Appliquer `(client_id, numero)` ferait échouer tout
-- transfert. C'est l'exigence MOD-11 (traçabilité amont, rappel produit) qui
-- impose de conserver le numéro d'origine.
--
-- L'identité réelle d'un lot est :
--     (client_id, article_id, site_id, numero)
--
--   * client_id  : étanchéité entre établissements (RI-01) ;
--   * article_id : deux fournisseurs peuvent facturer le même numéro ;
--   * site_id    : c'est ce qui distingue le lot d'origine de son miroir ;
--   * numero     : numéro fournisseur, conservé tel quel.
--
-- Ce que la contrainte interdit vraiment — et c'est son but : réceptionner
-- DEUX FOIS le même lot au même endroit, l'erreur qui double le stock en
-- silence quand deux personnes saisissent le même bon de livraison.
--
-- Pourquoi une clé PARTIELLE et pas une contrainte pleine : un miroir de
-- transfert peut être re-transféré puis revenir. Deux lignes du même numéro
-- sur le même site avec des quantités différentes sont alors légitimes.
-- Les réceptions directes écrivent `ref` = numéro de bon (ou null) ;
-- `transferer_article` écrit `ref` = 'TR-XXXXXXXX'. Le schéma distingue donc
-- déjà les deux cas sans colonne supplémentaire.
--
-- Additive only. Ne modifie aucune ligne (vérifié : aucun doublon existant).

-- ---------------------------------------------------------------- garde
do $garde$
declare
  v_doublon bigint;
begin
  if to_regclass('public.lots') is null then
    raise exception 'Migration 43 : table lots absente (migration 03 requise).'
      using errcode = 'P0001';
  end if;

  -- On refuse de poser une contrainte sur une base déjà incohérente : mieux
  -- vaut s'arrêter avec un message lisible que d'échouer sur un 23505 obscur
  -- en pleine migration.
  select count(*) into v_doublon from (
    select 1
      from public.lots
     where ref is null or ref not like 'TR-%'
     group by client_id, article_id, site_id, numero
    having count(*) > 1
  ) d;
  if v_doublon > 0 then
    raise exception 'Migration 43 refusee : % doublon(s) de lot deja presents. Corriger les donnees avant de contraindre.', v_doublon
      using errcode = 'P0001';
  end if;
end
$garde$;

-- ---------------------------------------------------------------- contrainte
-- Index unique PARTIEL : ne couvre que les réceptions directes.
create unique index if not exists lots_reception_unique
  on public.lots (client_id, article_id, site_id, numero)
  where ref is null or ref not like 'TR-%';

comment on index public.lots_reception_unique is
  'RI-04 : un lot reçu directement est unique par (client, article, site, numéro). Les miroirs de transfert (ref TR-*) en sont exemptés, sinon un aller-retour de marchandise serait refusé.';

-- Index de service : retrouver un lot par son numéro est l'opération la plus
-- fréquente d'un rappel produit (MOD-11). Sans lui, un rappel scanne la table.
create index if not exists lots_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 43)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 44-retrait-mode-carte.sql =====
-- =====================================================================
-- 44 — Retrait du mode de règlement « carte » (CIB / Edahabia).
--
-- Décision produit : la caisse ne propose plus que espèces et chèque/virement.
-- Effets :
--   1. Les ventes enregistrées avec mode « carte » passent à NULL
--      (mode non précisé) : aucune vente n'est supprimée ni recalculée.
--   2. La contrainte ventes_mode_paiement_valid n'accepte plus « carte ».
--   3. vendre_panier refuse « carte ». Son corps installé (21 + 32) est
--      patché avec des gardes strictes : si le corps diffère, la migration
--      s'arrête au lieu de deviner.
-- Compatible : l'application n'envoie plus « carte » ; les anciens clients
-- qui en enverraient recevraient « Mode de reglement invalide. ».
-- Non appliquée au pilote : exige une validation humaine explicite.
-- =====================================================================

update public.ventes
   set mode_paiement = null
 where mode_paiement = 'carte';

alter table public.ventes drop constraint if exists ventes_mode_paiement_valid;
alter table public.ventes
  add constraint ventes_mode_paiement_valid
  check (mode_paiement is null or mode_paiement in ('especes', 'cheque_virement'));

do $migration$
declare
  definition text;
  corrigee text;
  ancien constant text := 'if v_mode not in (''especes'', ''carte'', ''cheque_virement'') then';
  nouveau constant text := 'if v_mode not in (''especes'', ''cheque_virement'') then';
  n integer;
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 à 32 avant 40.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée
  else
    raise exception 'Corps de vendre_panier inattendu (garde carte introuvable ou ambiguë) : réconciliation manuelle requise.';
  end if;
end
$migration$;

-- ===== 45-recettes-libres.sql =====
-- Migration 44 — Recettes libres (saisie rapide DA multi-appareils)
-- Additive only. Idempotente et isolée par client_id.

create table if not exists public.recettes_libres (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 160),
  categorie text not null default 'Pâtisserie' check (char_length(categorie) <= 80),
  parts integer not null default 1 check (parts >= 1 and parts <= 10000),
  frais_fixes_da numeric(12,2) not null default 0 check (frais_fixes_da >= 0 and frais_fixes_da <= 100000000),
  prix_vente_da numeric(12,2) null check (prix_vente_da is null or (prix_vente_da >= 0 and prix_vente_da <= 100000000)),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  statut_prix text not null default 'valide' check (statut_prix in ('valide', 'a_verifier_patron', 'bloque')),
  cree_par uuid null references auth.users(id) on delete set null,
  modifie_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recettes_libres_client_idx
  on public.recettes_libres (client_id, updated_at desc);

alter table public.recettes_libres enable row level security;

revoke all on public.recettes_libres from public, anon;
grant select, insert, update, delete on public.recettes_libres to authenticated, service_role;

drop policy if exists recettes_libres_select on public.recettes_libres;
create policy recettes_libres_select on public.recettes_libres
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists recettes_libres_insert on public.recettes_libres;
create policy recettes_libres_insert on public.recettes_libres
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
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
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists recettes_libres_delete on public.recettes_libres;
create policy recettes_libres_delete on public.recettes_libres
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ===== 46-credits-clients.sql =====
-- Migration 45 — Carnet de crédits clients, cafés & entreprises
-- Additive only. Idempotente et isolée par client_id.

create table if not exists public.credits_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom_debiteur text not null check (char_length(trim(nom_debiteur)) between 1 and 140),
  telephone text not null default '' check (char_length(telephone) <= 40),
  type_compte text not null default 'particulier' check (type_compte in ('particulier', 'cafe_entreprise')),
  montant_total_da numeric(12,2) not null check (montant_total_da > 0 and montant_total_da <= 100000000),
  montant_regle_da numeric(12,2) not null default 0 check (montant_regle_da >= 0 and montant_regle_da <= 100000000),
  date_echeance date null,
  note text not null default '' check (char_length(note) <= 400),
  vente_id uuid null references public.ventes(id) on delete set null,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'solde', 'annule')),
  reglements jsonb not null default '[]'::jsonb check (jsonb_typeof(reglements) = 'array'),
  cree_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credits_regle_lte_total check (montant_regle_da <= montant_total_da)
);

create index if not exists credits_clients_client_statut_idx
  on public.credits_clients (client_id, statut, created_at desc);

alter table public.credits_clients enable row level security;

revoke all on public.credits_clients from public, anon;
grant select, insert, update, delete on public.credits_clients to authenticated, service_role;

drop policy if exists credits_clients_select on public.credits_clients;
create policy credits_clients_select on public.credits_clients
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists credits_clients_insert on public.credits_clients;
create policy credits_clients_insert on public.credits_clients
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur', 'labo')
  );

drop policy if exists credits_clients_update on public.credits_clients;
create policy credits_clients_update on public.credits_clients
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_delete on public.credits_clients;
create policy credits_clients_delete on public.credits_clients
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

create or replace function public.enregistrer_reglement_credit(
  p_credit_id uuid,
  p_montant_da numeric,
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
  v_row public.credits_clients%rowtype;
  v_new_regle numeric(12,2);
  v_new_statut text;
  v_entry jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_montant_da is null or p_montant_da <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_row
    from public.credits_clients
   where id = p_credit_id and client_id = v_client
   for update;

  if not found then raise exception 'Credit introuvable.'; end if;
  if v_row.statut <> 'ouvert' then raise exception 'Ce credit est deja solde ou annule.'; end if;

  v_new_regle := round((v_row.montant_regle_da + p_montant_da)::numeric, 2);
  if v_new_regle > v_row.montant_total_da then
    raise exception 'Le montant depasse le reste a payer.';
  end if;

  v_new_statut := case when v_new_regle >= v_row.montant_total_da then 'solde' else 'ouvert' end;
  v_entry := jsonb_build_object(
    'montant_da', round(p_montant_da::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 200),
    'at', now(),
    'par', v_auth
  );

  update public.credits_clients
     set montant_regle_da = v_new_regle,
         statut = v_new_statut,
         reglements = reglements || jsonb_build_array(v_entry),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'montant_regle_da', v_new_regle,
    'reste_da', round((v_row.montant_total_da - v_new_regle)::numeric, 2),
    'statut', v_new_statut
  );
end;
$$;

revoke execute on function public.enregistrer_reglement_credit(uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_reglement_credit(uuid, numeric, text) to authenticated, service_role;

-- ===== 47-onboarding-pack-dz.sql =====
-- Migration 46 — Validation rapide du tiroir depuis le Dashboard + Pack Pâtisserie DZ
-- Additive only. Idempotente.

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

-- ===== 48-notifications-patron.sql =====
-- Migration 47 — Notifications & Alertes Prix au Propriétaire (B.6)
-- Quand un employé saisit le prix d'un nouveau gâteau, tarte, cake ou recette,
-- le patron reçoit immédiatement une alerte (critique si le prix est trop bas).

create table if not exists public.notifications_patron (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('nouveau_prix_employe', 'prix_trop_bas')),
  severite text not null default 'warning' check (severite in ('info', 'warning', 'critical')),
  cible_type text not null check (cible_type in ('recette_libre', 'article', 'cake', 'nouveau_produit')),
  cible_id text not null default '',
  nom_produit text not null check (char_length(trim(nom_produit)) between 1 and 160),
  categorie text not null default 'gateau',
  prix_saisi_da numeric(12,2) not null check (prix_saisi_da >= 0 and prix_saisi_da <= 100000000),
  cout_estime_da numeric(12,2) null,
  prix_conseille_da numeric(12,2) null,
  auteur_id uuid null references auth.users(id) on delete set null,
  auteur_nom text not null default 'Employé',
  message text not null,
  traite_statut text not null default 'en_attente' check (traite_statut in ('en_attente', 'approuve', 'corrige', 'bloque')),
  prix_final_da numeric(12,2) null,
  traite_par uuid null references auth.users(id) on delete set null,
  traite_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_patron_client_statut_idx
  on public.notifications_patron (client_id, traite_statut, created_at desc);

alter table public.notifications_patron enable row level security;

revoke all on public.notifications_patron from public, anon;
grant select, insert, update, delete on public.notifications_patron to authenticated, service_role;

drop policy if exists notifications_patron_select on public.notifications_patron;
create policy notifications_patron_select on public.notifications_patron
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or auteur_id = auth.uid()
    )
  );

drop policy if exists notifications_patron_insert on public.notifications_patron;
create policy notifications_patron_insert on public.notifications_patron
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo', 'vendeur')
  );

drop policy if exists notifications_patron_update on public.notifications_patron;
create policy notifications_patron_update on public.notifications_patron
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
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
