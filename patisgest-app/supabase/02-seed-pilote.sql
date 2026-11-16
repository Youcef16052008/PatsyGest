-- =====================================================================
-- PâtisGest — Sprint 1 : données du pilote unique
-- Marche à suivre :
--   1) Supabase > Authentication > Users > Add user (e-mail + mot de passe)
--   2) Copier son UID, puis remplacer les 3 valeurs << ... >> ci-dessous
--   3) Exécuter ce script dans SQL Editor > Run
-- =====================================================================

do $$
declare
  v_client_id uuid;
  v_auth_uid uuid := '<<UID-DU-PILOTE-DANS-AUTHENTICATION-USERS>>';
  v_email text := '<<EMAIL-DU-PILOTE>>';
  v_nom_boutique text := '<<NOM-DE-LA-PATISSERIE>>';
begin
  insert into clients (nom, adresse, telephone, offre)
  values (v_nom_boutique, 'Oran', '0550 00 00 00', 'solo')
  returning id into v_client_id;

  insert into sites (client_id, nom, type)
  values
    (v_client_id, 'Laboratoire', 'laboratoire'),
    (v_client_id, 'Boutique', 'boutique');

  insert into utilisateurs (auth_user_id, client_id, email, nom, role)
  values (v_auth_uid, v_client_id, v_email, 'Propriétaire', 'proprietaire');
end $$;
