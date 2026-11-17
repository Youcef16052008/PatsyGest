-- =====================================================================
-- Migration 15 — Paramètres de coûts (Sprint3, RC-04).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * parametres_couts :1 ligne par tenant — taux horaire + charges %,
--     entrées de la MO chargée RC-04 = (min ÷ 60) × taux × (1 + charges %).
--   * Fiche de coût RC-01..RC-10 : lib cost-sheet.ts + tests (10 recettes
--     de référence au centime) — calcul côté app, aucune RPC.
--   * Caisse hors-ligne : file localStorage + idempotence par ticket
--     (vendre_article, migration06) — pas de DDL.
-- Rejouable.
-- =====================================================================

create table if not exists public.parametres_couts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  taux_horaire numeric not null default 0,
  charges_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint pc_taux_positif check (taux_horaire >= 0 and taux_horaire <= 1000000),
  constraint pc_charges_positif check (charges_pct >= 0 and charges_pct <= 1000)
);
alter table public.parametres_couts enable row level security;
create policy select_pc on public.parametres_couts for select using (client_id = public.patisgest_mon_client());
create policy insert_pc on public.parametres_couts for insert to authenticated with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy update_pc on public.parametres_couts for update to authenticated using (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo')) with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));
