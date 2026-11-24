/**
 * MOD-12 / US-12.1 — charge vs capacité d'une journée de laboratoire.
 *
 * « je planifie la journée (tâches, OF liés, durées, responsables) et je vois
 *   la charge vs capacité (ex. 480 min). »  — CDC v4.0
 *
 * Règle non négociable (RG-12.1) : **la surcharge est une alerte, jamais un
 * blocage**. Un laboratoire débordé doit pouvoir saisir sa journée ; lui
 * refuser l'enregistrement ne l'aide pas, ça le pousse à ne rien noter et à
 * travailler de mémoire. Le module calcule donc, conseille, et n'empêche rien.
 *
 * Pur et testable, comme les autres modules de décision (`cost-sheet`,
 * `liste-courses`, `export-comptable`) : le calcul qui dit « ta journée ne
 * tient pas » ne doit pas dépendre d'une page.
 */

export const CAPACITE_DEFAUT = 480;

export type TacheJour = {
  id: string;
  dureeMin: number;
  fait: boolean;
  responsable: string | null;
  libelle?: string;
};

export type NiveauCharge = "ok" | "plein" | "surcharge";

export type ChargeJour = {
  capacite: number;
  /** Minutes à produire : tâches non terminées seulement. */
  charge: number;
  /** Minutes encore disponibles (0 si dépassement). */
  restant: number;
  /** Minutes au-delà de la capacité (0 si ça tient). */
  depassement: number;
  /** Charge / capacité, borné à un nombre fini. */
  taux: number;
  niveau: NiveauCharge;
  /** Toujours false : RG-12.1 interdit le blocage. Explicite pour les tests. */
  bloquant: false;
  tachesTotal: number;
  tachesFaites: number;
  parResponsable: { responsable: string | null; charge: number; taches: number }[];
};

const minutes = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

const nomPropre = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length ? s : null;
};

export function chargeDuJour(taches: readonly TacheJour[], capacite = CAPACITE_DEFAUT): ChargeJour {
  // Une capacité absurde (0, négative, NaN) ne doit pas produire un taux
  // infini ni un « 100 % » mensonger : on retombe sur le standard de 8 h.
  const cap = Number.isFinite(capacite) && capacite > 0 ? capacite : CAPACITE_DEFAUT;

  let charge = 0;
  let faites = 0;
  const parResponsable = new Map<string, { charge: number; taches: number }>();

  for (const t of taches) {
    if (t?.fait) {
      faites += 1;
      continue;
    }
    const d = minutes(t?.dureeMin);
    charge += d;
    const cle = nomPropre(t?.responsable) ?? "";
    const agg = parResponsable.get(cle) ?? { charge: 0, taches: 0 };
    agg.charge += d;
    agg.taches += 1;
    parResponsable.set(cle, agg);
  }

  const restant = Math.max(0, cap - charge);
  const depassement = Math.max(0, charge - cap);
  const niveau: NiveauCharge = charge > cap ? "surcharge" : charge === cap ? "plein" : "ok";

  return {
    capacite: cap,
    charge,
    restant,
    depassement,
    taux: charge / cap,
    niveau,
    bloquant: false,
    tachesTotal: taches.length,
    tachesFaites: faites,
    parResponsable: [...parResponsable.entries()]
      .map(([resp, agg]) => ({
        responsable: resp === "" ? null : resp,
        charge: agg.charge,
        taches: agg.taches,
      }))
      .sort((a, b) => b.charge - a.charge),
  };
}

export type Repartition = {
  /** Tâches qui tiennent dans la capacité, dans l'ordre où on les conseille. */
  avec: TacheJour[];
  /** Tâches à décaler : proposées, jamais déplacées par le logiciel. */
  reportees: TacheJour[];
  message: string;
};

/**
 * Répartition conseillée : faire tenir la journée en reportant le moins de
 * tâches possible, et plutôt les courtes que les longues.
 *
 * L'algorithme est volontairement trivial et explicable à voix haute : on
 * garde les tâches dans l'ordre chronologique tant que ça tient, on reporte le
 * reste. Pas d'optimisation savante — le responsable de labo décide, le
 * logiciel propose. Un ordonnancement « optimal » qu'on ne peut pas expliquer
 * ne serait pas suivi.
 */
export function repartitionConseillee(
  taches: readonly TacheJour[],
  capacite = CAPACITE_DEFAUT,
): Repartition {
  const cap = Number.isFinite(capacite) && capacite > 0 ? capacite : CAPACITE_DEFAUT;
  const aPlacer = taches.filter((t) => !t?.fait);
  const faites = taches.filter((t) => t?.fait);

  // Les longues d'abord pour les placer : si une tâche de 400 min doit être
  // reportée, autant que ce soit elle et pas huit tâches de 50 min.
  const ordonnees = [...aPlacer].sort((a, b) => minutes(b.dureeMin) - minutes(a.dureeMin));
  const avec: TacheJour[] = [];
  const reportees: TacheJour[] = [];
  let reste = cap;
  for (const t of ordonnees) {
    const d = minutes(t.dureeMin);
    if (d <= reste) {
      avec.push(t);
      reste -= d;
    } else {
      reportees.push(t);
    }
  }

  const totalAvec = avec.reduce((s, t) => s + minutes(t.dureeMin), 0);
  const message = reportees.length === 0
    ? `La journée tient : ${totalAvec} min de travail pour ${cap} min disponibles.`
    : `La journée ne tient pas telle quelle : ${reportees.length} tâche${reportees.length > 1 ? "s" : ""} à décaler, ${totalAvec} min conservées sur ${cap}. Rien n'est déplacé automatiquement.`;

  return { avec: [...avec, ...faites], reportees, message };
}
