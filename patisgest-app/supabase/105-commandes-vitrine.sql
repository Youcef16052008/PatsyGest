-- =====================================================================
-- Migration 27 — Commandes de vitrine : dépôt public et traitement vendeur
--
-- Deux RPC, et deux seulement :
--
--   1. `patisgest_demander_commande`  — appelée par un visiteur ANONYME
--      depuis une vitrine publiée. Elle est la SEULE fonction exécutable
--      par `anon` dans tout le schéma (voir tests/securite.test.mjs, qui
--      exige une liste blanche explicite).
--
--   2. `patisgest_traiter_demande`    — appelée par le personnel, pour
--      accepter (→ devis) ou refuser (→ annule) une demande.
--
-- Pourquoi une RPC et pas un `insert` direct : `anon` n'a aucun droit
-- d'écriture sur `cakes` (migration 28), et il ne doit jamais en avoir.
-- La fonction décide elle-même du `client_id` (jamais fourni par le
-- visiteur), du numéro, du statut et du prix. Un visiteur ne peut donc
-- ni choisir son établissement, ni fixer un prix, ni marquer une
-- commande comme payée.
--
-- Idempotent : rejouable.
-- =====================================================================

begin;

-- ============================================================= 1. dépôt
create or replace function public.patisgest_demander_commande(
  p_sous_domaine text,
  p_cle_recette text,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts integer,
  p_note text,
  p_cle_navigateur text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_client uuid;
  v_famille text;
  v_cle text;
  v_numero text;
  v_id uuid;
  v_existant record;
  v_flux int;
begin
  -- ---- 1. le site visé : publié, et désigné par son sous-domaine.
  -- Un site « brouillon » ou « aucune » est traité exactement comme un
  -- site inexistant : pas de fuite d'existence.
  select s.id, s.client_id, s.nom
    into v_site
    from public.sites s
   where lower(s.subdomain) = lower(trim(coalesce(p_sous_domaine, '')))
     and s.publication = 'publiee'
   limit 1;
  if v_site.id is null then
    raise exception 'Vitrine introuvable ou non publiée.';
  end if;
  v_client := v_site.client_id;

  -- ---- 2. la recette : elle doit être réellement publiée sur CETTE
  -- vitrine. Sans ce contrôle, un visiteur pourrait commander une recette
  -- masquée en devinant sa clé.
  v_cle := public.patisgest_cle_nom(p_cle_recette);
  if v_cle is null then
    raise exception 'Recette invalide.';
  end if;
  select v.nom into v_famille
    from public.vitrine_catalogue v
   where v.client_id = v_client
     and v.subdomain = v_site.subdomain
     and v.cle_nom = v_cle
   limit 1;
  if v_famille is null then
    raise exception 'Cette recette n''est pas proposée par cette vitrine.';
  end if;

  -- ---- 3. validations de saisie (mêmes bornes que `creer_cake`).
  if p_client_nom is null or length(trim(p_client_nom)) < 2
     or length(trim(p_client_nom)) > 100 then
    raise exception 'Votre nom est requis (2 à 100 caractères).';
  end if;
  if p_telephone is null or length(regexp_replace(p_telephone, '[^0-9]', '', 'g')) < 6
     or length(p_telephone) > 40 then
    raise exception 'Un numéro de téléphone joignable est requis.';
  end if;
  if p_date_event is null or p_date_event < current_date then
    raise exception 'La date souhaitée doit être aujourd''hui ou plus tard.';
  end if;
  if p_date_event > current_date + 365 then
    raise exception 'Les commandes se prennent au plus un an à l''avance.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 à 10000).';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'Précisions trop longues (500 caractères maximum).';
  end if;

  -- ---- 4. idempotence : rejouer le même envoi renvoie la même demande.
  -- La clé est tirée par le navigateur et unique par établissement
  -- (index `cakes_cle_vitrine_unique`, migration 26). Un double clic,
  -- un retour arrière ou un réseau instable ne crée pas de doublon.
  v_cle := nullif(trim(coalesce(p_cle_navigateur, '')), '');
  if v_cle is null or length(v_cle) < 8 or length(v_cle) > 64 then
    raise exception 'Référence de demande invalide.';
  end if;

  select k.id, k.numero into v_existant
    from public.cakes k
   where k.client_id = v_client
     and k.cle_vitrine = v_cle
   limit 1;
  if v_existant.id is not null then
    return jsonb_build_object(
      'id', v_existant.id,
      'numero', v_existant.numero,
      'deja_enregistree', true);
  end if;

  -- ---- 5. garde-fou anti-flood, sans stocker d'IP (donnée personnelle
  -- qu'on n'a aucune raison de conserver). 30 demandes par heure et par
  -- établissement : au-delà, c'est un robot, pas une pâtisserie.
  select count(*) into v_flux
    from public.cakes k
   where k.client_id = v_client
     and k.origine = 'vitrine'
     and k.created_at > now() - interval '1 hour';
  if v_flux >= 30 then
    raise exception 'Trop de demandes en peu de temps. Merci de réessayer plus tard ou d''appeler la boutique.';
  end if;

  -- ---- 6. écriture. Le prix n'est PAS fixé par le visiteur : la demande
  -- part à 0 et c'est la boutique qui chiffre en l'acceptant.
  v_numero := 'VIT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, nb_parts,
    options, prix_ht, acompte, statut, cgv, notes, retro, paiements,
    site_id, origine, cle_vitrine, statut_note
  ) values (
    v_client, v_numero, trim(p_client_nom), trim(p_telephone), p_date_event, p_nb_parts,
    jsonb_build_array(jsonb_build_object('name', v_famille, 'cout', 0, 'minutes', 0)),
    0, 0, 'demande', false,
    nullif(trim(coalesce(p_note, '')), ''),
    '[]'::jsonb, '[]'::jsonb,
    v_site.id, 'vitrine', v_cle,
    'Demande déposée depuis la vitrine en ligne.'
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja_enregistree', false);
end;
$$;

-- Seule fonction du schéma ouverte à `anon` : `tests/securite.test.mjs`
-- contient une liste blanche nominative et échouera sur toute autre.
revoke all on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  to anon, authenticated;

-- ========================================================= 2. traitement
create or replace function public.patisgest_traiter_demande(
  p_id uuid,
  p_decision text
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
  v_cake record;
  v_statut text;
begin
  if v_auth is null then
    raise exception 'Non authentifié.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  -- Les vendeurs traitent les demandes : c'est explicitement leur rôle.
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Rôle non autorisé.';
  end if;
  if p_decision not in ('accepter', 'refuser') then
    raise exception 'Décision invalide (accepter ou refuser).';
  end if;

  select k.* into v_cake
    from public.cakes k
   where k.id = p_id
   for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if v_cake.client_id <> v_client then
    raise exception 'Demande hors périmètre.';
  end if;
  if v_cake.statut <> 'demande' then
    raise exception 'Cette demande a déjà été traitée (statut : %).', v_cake.statut;
  end if;

  -- Accepter ne veut pas dire vendre : la demande devient un DEVIS, que
  -- le personnel chiffre ensuite. Aucun prix n'est inventé ici.
  if p_decision = 'accepter' then
    v_statut := 'devis';
  else
    v_statut := 'annule';
  end if;

  update public.cakes k
     set statut = v_statut,
         statut_note = case
           when p_decision = 'accepter' then 'Demande de vitrine acceptée — à chiffrer.'
           else 'Demande de vitrine refusée.'
         end
   where k.id = p_id;

  return jsonb_build_object('id', p_id, 'statut', v_statut);
end;
$$;

revoke all on function public.patisgest_traiter_demande(uuid, text) from public, anon;
grant execute on function public.patisgest_traiter_demande(uuid, text) to authenticated;

commit;

-- ------------------------------------------------ vérification
--   -- anon ne peut exécuter qu'une fonction
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute');   -- 1 ligne
