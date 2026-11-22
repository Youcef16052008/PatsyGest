// Seed idempotents des données de parcours (stack locale jetable).
//
//  - l'article « Baba au rhum » et son lot sur la Boutique (pour la caisse et
//    le transfert) ;
//  - une famille de recette visible en vitrine + la boutique publiée sous le
//    sous-domaine `el-yasmine` (pour la commande publique).
//
// Renvoie false si PATSYGEST_PG_URL n'est pas défini (les specs alors ignorent
// le seed et échouent sur les préconditions).
import pg from 'pg';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const BOUTIQUE = '22222222-2222-4222-8222-222222222202';
const ARTICLE = '66666666-6666-4666-8666-666666666601';
const LOT = '77777777-7777-4777-8777-777777777701';
const FAMILLE = '88888888-8888-4888-8888-888888888801';

export async function seed() {
  const url = process.env.PATSYGEST_PG_URL;
  if (!url) return false;
  const db = new pg.Client(url);
  await db.connect();
  try {
    await db.query(
      `insert into articles (id, client_id, code, nom, niveau, unite, seuil, pv_ht, tva, allergenes, traces)
       values ($1, $2, 'P1', 'Baba au rhum', 'produit', 'pcs', 0, 350, 19, '{}', '{}')
       on conflict (id) do update set pv_ht = 350`,
      [ARTICLE, CLIENT],
    );
    await db.query(
      `insert into lots (id, client_id, article_id, site_id, numero, qte_init, qte_rest, pu, dlc, date_reception, congele, bloque)
       values ($1, $2, $3, $4, 'L1', 50, 50, 120, '2027-01-01', current_date, false, false)
       on conflict (id) do update set qte_rest = 50, bloque = false, congele = false`,
      [LOT, CLIENT, ARTICLE, BOUTIQUE],
    );
    await db.query(
      `insert into recette_familles (id, client_id, code, nom, cle_nom, nom_vitrine, description_vitrine, visible_vitrine, ordre_vitrine, produit_id)
       values ($1, $2, 'F1', 'Baba', 'baba', 'Baba au rhum', 'Le baba du jour', true, 1, $3)
       on conflict (id) do update set visible_vitrine = true, cle_nom = 'baba'`,
      [FAMILLE, CLIENT, ARTICLE],
    );
    await db.query(
      `update sites set subdomain = 'el-yasmine', publication = 'publiee' where id = $1`,
      [BOUTIQUE],
    );
  } finally {
    await db.end();
  }
  return true;
}
