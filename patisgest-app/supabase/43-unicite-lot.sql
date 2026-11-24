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
