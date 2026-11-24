-- =====================================================================
-- 40 — Retrait du mode de règlement « carte » (CIB / Edahabia).
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
begin;

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

commit;
