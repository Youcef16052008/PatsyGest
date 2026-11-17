-- =====================================================================
-- PâtisGest — Sprint 1 : données du pilote unique (Pâtisserie El Yasmine — Oran)
-- Crée les 3 comptes Auth de démonstration (mot de passe : PatisGest2026!) :
--   • amina@patisserie.dz (Propriétaire)
--   • sara@patisserie.dz  (Laboratoire)
--   • amine@patisserie.dz (Vendeur)
-- ainsi que le client pilote et ses 2 sites (Laboratoire + Boutique).
-- =====================================================================

do $$
declare
  v_client_id uuid := '11111111-1111-4111-8111-111111111111';
  v_site_labo uuid := '22222222-2222-4222-8222-222222222201';
  v_site_boutique uuid := '22222222-2222-4222-8222-222222222202';
  v_uid_prop uuid := '33333333-3333-4333-8333-333333333301';
  v_uid_labo uuid := '33333333-3333-4333-8333-333333333302';
  v_uid_vend uuid := '33333333-3333-4333-8333-333333333303';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values
  (
    '00000000-0000-0000-0000-000000000000', v_uid_prop, 'authenticated', 'authenticated',
    'amina@patisserie.dz', crypt('PatisGest2026!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{"nom":"Aïcha (Propriétaire)"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_uid_labo, 'authenticated', 'authenticated',
    'sara@patisserie.dz', crypt('PatisGest2026!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{"nom":"Sara (Responsable Labo)"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_uid_vend, 'authenticated', 'authenticated',
    'amine@patisserie.dz', crypt('PatisGest2026!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{"nom":"Amine (Vendeur Caisse)"}'::jsonb,
    now(), now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values
  (
    gen_random_uuid(), v_uid_prop, v_uid_prop::text,
    jsonb_build_object('sub', v_uid_prop::text, 'email', 'amina@patisserie.dz', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), v_uid_labo, v_uid_labo::text,
    jsonb_build_object('sub', v_uid_labo::text, 'email', 'sara@patisserie.dz', 'email_verified', true),
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), v_uid_vend, v_uid_vend::text,
    jsonb_build_object('sub', v_uid_vend::text, 'email', 'amine@patisserie.dz', 'email_verified', true),
    'email', now(), now(), now()
  )
  on conflict do nothing;

  insert into clients (id, nom, adresse, telephone, nif, nis, rc, offre)
  values (v_client_id, 'Pâtisserie El Yasmine — Oran', 'Rue Emir Abdelkader, Oran', '0550 12 34 56', 'NIF 123456789', 'NIS 987654321', 'RC 31/00-123456B26', 'pro')
  on conflict (id) do nothing;

  insert into sites (id, client_id, nom, type, adresse)
  values
    (v_site_labo, v_client_id, 'Laboratoire — Oran Centre', 'laboratoire', 'Rue Emir Abdelkader, Oran'),
    (v_site_boutique, v_client_id, 'Boutique — Front de Mer', 'boutique', 'Boulevard de l''ALN, Oran')
  on conflict (id) do nothing;

  insert into utilisateurs (auth_user_id, client_id, email, nom, role)
  values
    (v_uid_prop, v_client_id, 'amina@patisserie.dz', 'Aïcha (Propriétaire)', 'proprietaire'),
    (v_uid_labo, v_client_id, 'sara@patisserie.dz', 'Sara (Responsable Labo)', 'labo'),
    (v_uid_vend, v_client_id, 'amine@patisserie.dz', 'Amine (Vendeur)', 'vendeur')
  on conflict (auth_user_id) do nothing;
end $$;
