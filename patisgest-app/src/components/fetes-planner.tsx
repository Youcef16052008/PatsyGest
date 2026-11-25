"use client";

import { useMemo, useState } from "react";
import {
  computeFetesShoppingList,
  FETE_SPECIALTIES,
  whatsappMarketListUrl,
} from "@/lib/fetes-dz";
import { dinars } from "@/lib/workspace-data";

type SeasonFilter = "toutes" | "aid_fitr" | "ramadan" | "mariage";

const SEASON_LABELS: Record<SeasonFilter, string> = {
  toutes: "Toutes les fêtes",
  aid_fitr: "Aïd El-Fitr / El-Adha",
  ramadan: "Ramadan",
  mariage: "Mariages & Fiançailles",
};

export default function FetesPlanner() {
  const [season, setSeason] = useState<SeasonFilter>("toutes");
  const [quantities, setQuantities] = useState<Record<string, number>>({
    "fete-baklawa": 10,
    "fete-makrout-assel": 8,
    "fete-tcharek": 4,
  });
  const [buyerPhone, setBuyerPhone] = useState("");

  const visibleSpecs = useMemo(
    () =>
      season === "toutes"
        ? FETE_SPECIALTIES
        : FETE_SPECIALTIES.filter((s) => s.saisons.includes(season)),
    [season],
  );

  const plan = useMemo(() => computeFetesShoppingList(quantities), [quantities]);
  const waUrl = useMemo(
    () =>
      whatsappMarketListUrl({
        phone: buyerPhone,
        titre: SEASON_LABELS[season],
        plan,
      }),
    [buyerPhone, season, plan],
  );

  function stepQty(id: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + delta),
    }));
  }

  return (
    <div className="pg-stack">
      <section className="pg-card pg-card-pad pg-stack">
        <div className="pg-card-head">
          <div>
            <span className="pg-kicker">SPÉCIAL PÂTISSERIE ALGÉRIENNE</span>
            <h2>Préparer le Ramadan, l’Aïd ou les Mariages</h2>
            <p className="text-sm pg-muted">
              Indiquez les kg ou plateaux commandés : l’app calcule votre liste de courses globale au marché et le budget d’achat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQuantities({})}
            className="pg-button pg-button-secondary text-xs"
          >
            Tout remettre à zéro
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par fête">
          {(Object.keys(SEASON_LABELS) as SeasonFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSeason(key)}
              className="pg-segment-btn"
              data-active={season === key ? "true" : undefined}
            >
              {SEASON_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSpecs.map((spec) => {
            const q = quantities[spec.id] ?? 0;
            return (
              <div
                key={spec.id}
                className="rounded-xl border p-3.5 flex flex-col justify-between gap-3"
                style={{ background: q > 0 ? "var(--pg-tint)" : "var(--pg-subtle)" }}
              >
                <div>
                  <strong className="block text-sm">{spec.nom}</strong>
                  <span className="text-xs pg-muted">
                    Prix vente repère : {dinars(spec.prixVenteUniteDa, false)} / {spec.uniteVente}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepQty(spec.id, -1)}
                    className="pg-icon-button"
                    aria-label={`Diminuer ${spec.nom}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={q}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [spec.id]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="pg-input w-24 text-center"
                    aria-label={`Quantité ${spec.nom}`}
                  />
                  <button
                    type="button"
                    onClick={() => stepQty(spec.id, 1)}
                    className="pg-icon-button"
                    aria-label={`Augmenter ${spec.nom}`}
                  >
                    +
                  </button>
                  <span className="text-xs font-bold pg-muted">{spec.uniteVente}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pg-card pg-card-pad pg-stack">
        <div className="pg-card-head">
          <div>
            <h3>Liste de courses globale pour le marché</h3>
            <p className="text-xs pg-muted">Ingrédients additionnés automatiquement selon vos quantités</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="pg-badge" data-tone="warning">
              Budget achats : {dinars(plan.budgetAchatsDa, false)}
            </span>
            <span className="pg-badge" data-tone="success">
              Bénéfice prévu : {dinars(plan.beneficeEstimeDa, false)}
            </span>
          </div>
        </div>

        {plan.lignesMarche.length === 0 ? (
          <p className="text-sm pg-muted">Sélectionnez au moins un gâteau ou plateau ci-dessus pour générer la liste de courses.</p>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b p-2 text-xs pg-muted">Ingrédient à acheter</th>
                    <th className="border-b p-2 text-xs pg-muted">Quantité totale</th>
                    <th className="border-b p-2 text-xs pg-muted text-right">Coût estimé (DA)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lignesMarche.map((l) => (
                    <tr key={`${l.nom}-${l.uniteBase}`}>
                      <td className="border-b p-2 font-semibold">{l.nom}</td>
                      <td className="border-b p-2 font-bold">{l.quantiteAffichee}</td>
                      <td className="border-b p-2 text-right">{dinars(l.coutEstimeDa, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
              <label className="pg-field min-w-52 max-w-xs flex-1">
                WhatsApp acheteur / grossiste (optionnel)
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="0550 00 00 00"
                  className="pg-input"
                />
              </label>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pg-button"
              >
                Envoyer la liste sur WhatsApp →
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
