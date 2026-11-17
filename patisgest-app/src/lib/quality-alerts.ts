/**
 * Rappels qualité HACCP (purs) : températures, nettoyages, non-conformités,
 * DLC et tâches de planning en retard. Aucune dépendance — testable seul.
 */

export type NiveauAlerte = "critique" | "alerte" | "attention";

export type AlerteQualite = {
  niveau: NiveauAlerte;
  cle: string;
  titre: string;
  detail: string;
};

export type ReleveTemp = {
  frigoNom: string;
  dateReleve: string; // ISO date ou datetime
  temperature: number;
  seuilMax: number;
};

export type NettoyageRow = { zone: string; dateNettoyage: string; fait: boolean };
export type NcRow = { type: string; lotNumero: string | null; statut: string; dateNc: string };
export type LotDlc = {
  numero: string; code: string; nom: string;
  dlc: string | null; qteRest: number; bloque: boolean;
};
export type TacheRow = { tache: string; dateTache: string; fait: boolean };

export type QualiteInput = {
  /** Date du jour ISO (yyyy-mm-dd) — injectée pour rester pur. */
  today: string;
  temperatures: ReleveTemp[];
  nettoyages: NettoyageRow[];
  nonConformites: NcRow[];
  lots: LotDlc[];
  taches: TacheRow[];
};

const ORDRE: Record<NiveauAlerte, number> = { critique: 0, alerte: 1, attention: 2 };
const day = (iso: string) => String(iso).slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${day(iso)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const estCloturee = (statut: string) => {
  const s = statut.trim().toLowerCase();
  return s === "cloturee" || s === "clôturée" || s === "cloturée";
};

export function computeQualityAlerts(input: QualiteInput): AlerteQualite[] {
  const out: AlerteQualite[] = [];
  const today = day(input.today);
  const dans7 = addDays(today, 7);

  // Températures : dernier relevé par frigo.
  const parFrigo = new Map<string, ReleveTemp>();
  for (const r of input.temperatures) {
    const cur = parFrigo.get(r.frigoNom);
    if (!cur || day(r.dateReleve) >= day(cur.dateReleve)) parFrigo.set(r.frigoNom, r);
  }
  for (const [frigo, r] of parFrigo) {
    if (r.temperature > r.seuilMax) {
      out.push({
        niveau: "critique",
        cle: `temp-${frigo}`,
        titre: `Température dépassée — ${frigo}`,
        detail: `${r.temperature} °C relevés (seuil ${r.seuilMax} °C) le ${day(r.dateReleve)}.`,
      });
    } else if (day(r.dateReleve) !== today) {
      out.push({
        niveau: "attention",
        cle: `temp-manquante-${frigo}`,
        titre: `Relevé manquant — ${frigo}`,
        detail: `Dernier relevé le ${day(r.dateReleve)} — aucun relevé aujourd'hui.`,
      });
    }
  }

  // Nettoyages en retard.
  for (const n of input.nettoyages) {
    if (!n.fait && day(n.dateNettoyage) < today) {
      out.push({
        niveau: "alerte",
        cle: `nettoyage-${n.zone}-${n.dateNettoyage}`,
        titre: `Nettoyage en retard — ${n.zone}`,
        detail: `Prvu le ${day(n.dateNettoyage)}, toujours non fait.`,
      });
    }
  }

  // Non-conformités ouvertes.
  for (const nc of input.nonConformites) {
    if (!estCloturee(nc.statut)) {
      out.push({
        niveau: "alerte",
        cle: `nc-${nc.type}-${nc.lotNumero ?? nc.dateNc}`,
        titre: `Non-conformité ouverte — ${nc.type}`,
        detail: `Lot ${nc.lotNumero ?? "—"} · déclarée le ${day(nc.dateNc)} · statut ${nc.statut}.`,
      });
    }
  }

  // DLC des lots en stock.
  for (const l of input.lots) {
    if (l.bloque || !(l.qteRest > 0) || !l.dlc) continue;
    const dlc = day(l.dlc);
    if (dlc < today) {
      out.push({
        niveau: "critique",
        cle: `dlc-expiree-${l.numero}`,
        titre: `DLC expirée — ${l.numero}`,
        detail: `${l.code} ${l.nom} : DLC ${dlc} passée (${l.qteRest} en stock).`,
      });
    } else if (dlc <= dans7) {
      out.push({
        niveau: "attention",
        cle: `dlc-proche-${l.numero}`,
        titre: `DLC proche — ${l.numero}`,
        detail: `${l.code} ${l.nom} : DLC ${dlc} (dans ${Math.round((Date.parse(dlc) - Date.parse(today)) / 86_400_000)} j).`,
      });
    }
  }

  // Tâches de planning en retard.
  for (const t of input.taches) {
    if (!t.fait && day(t.dateTache) < today) {
      out.push({
        niveau: "attention",
        cle: `tache-${t.tache}-${t.dateTache}`,
        titre: `Tâche en retard — ${t.tache}`,
        detail: `Prvue le ${day(t.dateTache)}, non faite.`,
      });
    }
  }

  return out.sort((a, b) => ORDRE[a.niveau] - ORDRE[b.niveau] || a.cle.localeCompare(b.cle));
}
