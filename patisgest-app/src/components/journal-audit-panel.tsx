import Link from "next/link";
import { presenterJournal, resumeJournal, type LigneAudit } from "@/lib/journal-audit";

/**
 * NF-10 — écran de consultation du journal d'audit (composant serveur).
 *
 * Aucun client JS : le journal est en lecture seule et borné (200 lignes par
 * page). Le rendre interactif n'apporterait rien et obligerait à exposer des
 * lignes brutes au navigateur.
 *
 * Le texte du panneau est délibérément explicite sur ce que le journal ne
 * garantit pas : un écran d'audit qui laisse croire à une garantie qu'on n'a
 * pas est pire que pas d'écran du tout.
 */

const OPERATION_STYLE: Record<string, string> = {
  INSERT: "pg-badge",
  UPDATE: "pg-badge",
  DELETE: "pg-badge",
};

const OPERATION_LABEL: Record<string, string> = {
  INSERT: "création",
  UPDATE: "modification",
  DELETE: "suppression",
  autre: "autre",
};

export default function JournalAuditPanel({
  lignes,
  erreur,
  migrationAbsente,
}: {
  lignes: LigneAudit[];
  erreur: boolean;
  /** true si la migration 40 n'est pas appliquée : message d'action, pas d'alarme. */
  migrationAbsente: boolean;
}) {
  if (migrationAbsente) {
    return (
      <section className="pg-card pg-card-pad mt-6">
        <div className="pg-card-head">
          <div>
            <h2>Journal d’audit</h2>
            <p>
              Le journal « qui, quoi, quand » (NF-10) n’est pas encore actif sur cette base :
              la migration <code>40-journal-audit</code> doit être appliquée. Aucune donnée
              n’est perdue — le journal ne peut pas être rempli rétroactivement, il commence
              au premier événement suivant l’application de la migration.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (erreur) {
    return (
      <section className="pg-card pg-card-pad mt-6">
        <div className="pg-card-head">
          <div>
            <h2>Journal d’audit</h2>
            <p role="alert">Journal momentanément illisible. Réessayez ; si cela persiste, vérifiez la connexion à la base.</p>
          </div>
        </div>
      </section>
    );
  }

  const affiches = presenterJournal(lignes);
  const resume = resumeJournal(affiches);

  return (
    <section className="pg-card pg-card-pad mt-6">
      <div className="pg-card-head">
        <div>
          <h2>Journal d’audit</h2>
          <p>
            Qui a fait quoi, et quand, sur les ventes, les stocks, les clôtures, les
            fabrications et les comptes. Conservation 10 ans, lignes non modifiables et non
            supprimables avant terme (NF-10, RI-06). Seul le propriétaire de l’espace peut le lire.
          </p>
        </div>
      </div>

      {affiches.length === 0 ? (
        <p>
          Aucun événement depuis l’activation du journal. Les prochaines ventes, réceptions et
          clôtures apparaîtront ici automatiquement.
        </p>
      ) : (
        <>
          <p className="pg-muted">
            {affiches.length} dernier{affiches.length > 1 ? "s" : ""} événement
            {affiches.length > 1 ? "s" : ""} affiché{affiches.length > 1 ? "s" : ""} — page
            courante : {resume.creations} création{resume.creations > 1 ? "s" : ""},{" "}
            {resume.modifications} modification{resume.modifications > 1 ? "s" : ""},{" "}
            {resume.suppressions} suppression{resume.suppressions > 1 ? "s" : ""}. Les compteurs
            portent sur cette page, pas sur l’intégralité du journal.
          </p>
          <div className="pg-table-wrap">
            <table className="pg-table">
              <caption className="pg-muted">
                Journal d’audit — 200 événements les plus récents
              </caption>
              <thead>
                <tr>
                  <th scope="col">Quand</th>
                  <th scope="col">Qui</th>
                  <th scope="col">Quoi</th>
                  <th scope="col">Sur</th>
                </tr>
              </thead>
              <tbody>
                {affiches.map((a) => (
                  <tr key={a.id}>
                    <td><time dateTime={lignes.find((l) => l.id === a.id)?.cree_le}>{a.quand}</time></td>
                    <td>
                      {a.acteur}
                      {a.systeme ? <small className="pg-muted"> (système)</small> : null}
                    </td>
                    <td>
                      <span className={OPERATION_STYLE[a.operation] ?? "pg-badge"} data-tone={a.operation === "DELETE" ? "danger" : undefined}>
                        {OPERATION_LABEL[a.operation] ?? "autre"}
                      </span>{" "}
                      {a.libelle}
                    </td>
                    <td className="pg-muted">{a.cible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="pg-muted mt-4">
        Le journal enregistre l’identité de l’auteur depuis la session, jamais depuis la
        requête : un compte ne peut pas signer une action au nom d’un autre. Il ne peut en
        revanche pas empêcher un administrateur de la base de modifier les fichiers sous-jacents —
        c’est le rôle des sauvegardes et de la revue d’exploitation, pas du journal.
        {" "}
        <Link href="/mentions-legales">Politique de conservation</Link>
      </p>
    </section>
  );
}
