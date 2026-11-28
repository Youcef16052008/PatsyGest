import type { DonneesCourses } from "@/lib/courses-server";

/**
 * US-03.3 — liste de courses affichée dans le module Achats.
 *
 * Composant serveur, lecture seule. Le but est qu'un gérant puisse appeler son
 * fournisseur avec cet écran sous les yeux, sans recalculer quoi que ce soit.
 * Quand le stock et les commandes couvrent le besoin, on le dit franchement
 * plutôt que d'afficher un tableau vide et laisser croire à une panne.
 */

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 3 }).format(n);

export default function ListeCoursesPanel({
  donnees,
  peutVoir,
}: {
  donnees: DonneesCourses;
  /** false pour un rôle sans lecture des coûts/besoins : le panneau est masqué. */
  peutVoir: boolean;
}) {
  if (!peutVoir) return null;

  if (donnees.erreur) {
    return (
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2>Liste de courses</h2>
            <p role="alert">
              Impossible de calculer la liste : une des lectures (fabrications, stock,
              commandes) a échoué. Ne commandez pas à l’aveugle — rechargez la page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { resultat, nbOf } = donnees;
  const aAcheter = resultat.aAcheter;

  return (
    <section className="pg-card pg-card-pad">
      <div className="pg-card-head">
        <div>
          <h2>Liste de courses</h2>
          <p>
            Calculée automatiquement : besoins des {nbOf} fabrication{nbOf > 1 ? "s" : ""} en
            cours, moins le stock disponible, moins ce qui est déjà commandé. Vous n’avez rien
            à recopier.
          </p>
        </div>
      </div>

      {resultat.lignes.length === 0 ? (
        <p>
          Aucune fabrication planifiée : il n’y a donc rien à acheter. Dès qu’une fournée
          est lancée en production, ses ingrédients apparaissent ici.
        </p>
      ) : aAcheter.length === 0 ? (
        <p>
          Stock et commandes en cours couvrent tout le besoin des {nbOf} fabrication
          {nbOf > 1 ? "s" : ""} planifiée{nbOf > 1 ? "s" : ""}. Rien à acheter pour le moment.
          {" "}
          <span className="pg-muted">
            ({resultat.lignes.length} ingrédient{resultat.lignes.length > 1 ? "s" : ""} vérifié
            {resultat.lignes.length > 1 ? "s" : ""} — le détail reste ci-dessous.)
          </span>
        </p>
      ) : (
        <>
          <p className="pg-muted">
            {aAcheter.length} article{aAcheter.length > 1 ? "s" : ""} à acheter, classé
            {aAcheter.length > 1 ? "s" : ""} par urgence : d’abord les ruptures totales.
          </p>
          <div className="pg-table-wrap">
            <table className="pg-table">
              <caption className="pg-muted">À commander</caption>
              <thead>
                <tr>
                  <th scope="col">Article</th>
                  <th scope="col">Besoin</th>
                  <th scope="col">En stock</th>
                  <th scope="col">Déjà commandé</th>
                  <th scope="col">À acheter</th>
                </tr>
              </thead>
              <tbody>
                {aAcheter.map((l) => (
                  <tr key={l.articleId}>
                    <td>{l.nom}</td>
                    <td>{fmt(l.besoin)} {l.unite}</td>
                    <td>{fmt(l.stock)} {l.unite}</td>
                    <td>{fmt(l.enCommande)} {l.unite}</td>
                    <td>
                      <strong>{fmt(l.aAcheter)} {l.unite}</strong>
                      {l.statut === "rupture" ? (
                        <small className="pg-muted"> — rupture totale</small>
                      ) : null}
                      {l.uniteIncoherente ? (
                        <small className="pg-muted">
                          {" "}— stock dans une autre unité, non déduit par prudence
                        </small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {resultat.ignores > 0 ? (
        <p className="pg-muted">
          {resultat.ignores} ligne{resultat.ignores > 1 ? "s" : ""} de recette ancienne
          sans article rattaché n’{resultat.ignores > 1 ? "ont" : "a"} pas pu être prise en
          compte. Ouvrez la recette concernée et rattachez ses ingrédients au stock pour que
          le calcul les inclue.
        </p>
      ) : null}

      <p className="pg-muted">
        La liste ne déclenche aucune commande : elle prépare la vôtre. Les unités ne sont
        jamais converties ici — une conversion implicite produirait un achat faux, donc un
        stock faux.
      </p>
    </section>
  );
}
