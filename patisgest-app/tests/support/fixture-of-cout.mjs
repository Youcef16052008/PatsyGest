// Toutes les données et identités de cette fixture sont fictives.
export async function creerFixtureOfCout(db) {
    await db.exec(`insert into clients(id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fictif');
      insert into utilisateurs(id,auth_user_id,client_id,email,role) values
        ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.test','proprietaire');
      insert into sites(id,client_id,nom) values
        ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Labo');
      insert into articles(id,client_id,code,nom,niveau,unite) values
        ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PROD','Produit','produit','pcs');
      insert into recette_familles(id,client_id,code,nom,produit_id) values
        ('55555555-5555-5555-5555-555555555555','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','REC','Recette','44444444-4444-4444-4444-444444444444');
      insert into recette_versions(id,client_id,famille_id,rendement_qte) values
        ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555',80);
      insert into ordres_fabrication(id,client_id,famille_id,version_id,site_id,numero,qte_prevue,statut,consommations) values
        ('77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333','OF-TEST',80,'encours','[{"qty":80,"pu":10}]');
      select set_config('test.uid','22222222-2222-2222-2222-222222222222',false);`);
}
