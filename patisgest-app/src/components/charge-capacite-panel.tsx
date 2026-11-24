import { chargeDuJour, repartitionConseillee, type TacheJour } from "@/lib/charge-capacite";

/**
 * MOD-12 / US-12.1 — charge vs capacité de la journée.
 *
 * Le panneau dit trois choses, dans cet ordre : combien de minutes sont
 * engagées, si la journée tient, et quoi décaler si elle ne tient pas. Il ne
 * déplace jamais rien lui-même (RG-12.1) et ne cache pas la surcharge derrière
 * une couleur : le texte doit suffire si l'écran est photocopié en noir et blanc.
 */

const h = (min: number) => {
  const heures = Math.floor(min / 60);
  const reste = min % 60;
  if (!heures) return `${reste} min`;
  if (!reste) return `${heures} h`;
  return `${heures} h ${String(reste).padStart(2, "0")}`;
};

export default function ChargeCapacitePanel({
  taches,
  capacite,
  jour,
}: {
  taches: TacheJour[];
  capacite?: number;
  jour: string;
}) {
  const c = chargeDuJour(taches, capacite);

  if (c.tachesTotal === 0) {
    return (
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2>Charge du jour</h2>
            <p>
              Aucune tâche planifiée pour le {jour}. Ajoutez des tâches ci-dessous : la charge
              et le temps restant se calculent au fur et à mesure.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const pourcent = Math.min(100, Math.round(c.taux * 100));
  const repartition = c.niveau === "surcharge" ? repartitionConseillee(taches, c.capacite) : null;

  return (
    <section className="pg-card pg-card-pad">
      <div className="pg-card-head">
        <div>
          <h2>Charge du jour — {jour}</h2>
          <p>
            {h(c.charge)} de travail engagé sur {h(c.capacite)} de capacité disponible
            {c.tachesFaites > 0
              ? ` (${c.tachesFaites} tâche${c.tachesFaites > 1 ? "s" : ""} déjà terminée${c.tachesFaites > 1 ? "s" : ""}, non comptée${c.tachesFaites > 1 ? "s" : ""})`
              : ""}.
          </p>
        </div>
      </div>

      <div
        className="pg-load-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcent}
        aria-valuetext={`${pourcent} % de la capacité journalière`}
        aria-label="Charge par rapport à la capacité"
      >
        <span style={{ width: `${pourcent}%` }} data-niveau={c.niveau} />
      </div>

      {c.niveau === "surcharge" ? (
        <div role="status" className="pg-notice" data-kind="warning">
          <p>
            <strong>Journée en surcharge de {h(c.depassement)}.</strong> Ce n’est pas un
            blocage : vous pouvez enregistrer la journée telle quelle. La suggestion ci-dessous
            vous indique quoi décaler si vous préférez qu’elle tienne.
          </p>
        </div>
      ) : c.niveau === "plein" ? (
        <p>
          La journée est exactement pleine. Aucune marge : la moindre imprévu (panne,
          retard de livraison) se répercutera sur la production.
        </p>
      ) : (
        <p>
          Il reste <strong>{h(c.restant)}</strong> de capacité. La journée tient.
        </p>
      )}

      {repartition ? (
        <div className="mt-4">
          <h3>Répartition conseillée</h3>
          <p className="pg-muted">{repartition.message}</p>
          <ul>
            {repartition.reportees.map((t) => (
              <li key={t.id}>
                À décaler : <strong>{t.libelle ?? "Tâche"}</strong> — {h(t.dureeMin)}
                {t.responsable ? ` (${t.responsable})` : ""}
              </li>
            ))}
          </ul>
          <p className="pg-muted">
            Rien n’a été déplacé : le planning reste celui que vous avez saisi. C’est vous qui
            décidez de la suite.
          </p>
        </div>
      ) : null}

      {c.parResponsable.length > 1 ? (
        <div className="mt-4">
          <h3>Par responsable</h3>
          <ul>
            {c.parResponsable.map((r) => (
              <li key={r.responsable ?? "sans"}>
                {r.responsable ?? "Sans responsable"} : {h(r.charge)} sur {r.taches} tâche
                {r.taches > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
