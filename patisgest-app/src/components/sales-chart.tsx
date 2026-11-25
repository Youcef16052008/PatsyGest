"use client";
import { useId, useState } from "react";
import { dateLisible, dinars, type VentesJour } from "@/lib/workspace-data";
import { Notice } from "./workspace-ui";

export default function SalesChart({ series }: { series: VentesJour[] | null }) {
  const id = useId();
  const periods = (series?.length ?? 0) >= 30 ? [7, 14, 30] : [7, 14];
  const [period, setPeriod] = useState(7);
  const [chartType, setChartType] = useState<"bars" | "line">("bars");
  const jours = series?.slice(-period) ?? [];
  const somme = jours.reduce((s, d) => s + Math.round(d.ttc * 100), 0) / 100;
  const max = Math.max(1, ...jours.map((d) => d.ttc));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const ceiling = Math.ceil(max / step) * step;
  const plot = jours.map((d, i) => [
    (i * 548) / Math.max(1, jours.length - 1),
    141 - (128 * d.ttc) / ceiling,
  ]);
  const points = plot.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const labels = jours.filter((_, i) => [0, Math.floor((jours.length - 1) / 2), jours.length - 1].includes(i));
  const barWidth = Math.max(8, Math.min(34, Math.floor(460 / Math.max(1, jours.length))));

  return (
    <section className="pg-card pg-card-pad pg-chart-card" aria-labelledby={`${id}-title`}>
      <div className="pg-card-head">
        <div>
          <h2 id={`${id}-title`}>Chiffre d’affaires</h2>
          <p>Ventes encaissées sur les {period} derniers jours</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="pg-segment" role="group" aria-label="Style de graphique">
            <button type="button" aria-pressed={chartType === "bars"} onClick={() => setChartType("bars")}>
              Barres
            </button>
            <button type="button" aria-pressed={chartType === "line"} onClick={() => setChartType("line")}>
              Courbe
            </button>
          </div>
          <div className="pg-segment" role="group" aria-label="Période des ventes">
            {periods.map((p) => (
              <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>
                {p} j
              </button>
            ))}
          </div>
        </div>
      </div>

      {!series ? (
        <Notice kind="warning">Les ventes de la période sont indisponibles.</Notice>
      ) : (
        <>
          <div className="pg-chart-amount">
            <strong>{dinars(somme, false)}</strong>
            <span>Total sur {period} jours</span>
          </div>
          <figure className="pg-chart" aria-label={`Évolution des ventes sur ${period} jours : ${dinars(somme)} au total`}>
            <div className="pg-chart-axis" aria-hidden="true">
              {[1, 0.75, 0.5, 0.25, 0].map((x) => (
                <span key={x}>
                  {new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(ceiling * x)}
                </span>
              ))}
            </div>
            <svg viewBox="-12 0 572 145" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={`${id}-fill`} x2="0" y2="1">
                  <stop stopColor="currentColor" stopOpacity=".28" />
                  <stop offset="1" stopColor="currentColor" stopOpacity=".04" />
                </linearGradient>
              </defs>
              {[13, 45, 77, 109, 141].map((y) => (
                <path className="pg-chart-gridline" key={y} d={`M0 ${y}H548`} vectorEffect="non-scaling-stroke" />
              ))}
              {chartType === "bars" ? (
                jours.map((d, i) => {
                  const xCenter = ((i + 0.5) * 548) / Math.max(1, jours.length);
                  const h = Math.max(d.ttc > 0 ? 4 : 0, (128 * d.ttc) / ceiling);
                  const y = 141 - h;
                  return (
                    <rect
                      key={d.day}
                      x={xCenter - barWidth / 2}
                      y={y}
                      width={barWidth}
                      height={h}
                      rx={4}
                      fill="currentColor"
                      opacity={i === jours.length - 1 ? 1 : 0.72}
                    >
                      <title>{`${dateLisible(d.day, "short")} : ${dinars(d.ttc)}`}</title>
                    </rect>
                  );
                })
              ) : (
                <>
                  <polygon fill={`url(#${id}-fill)`} points={`0,141 ${points} 548,141`} />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {plot.map(([x, y], i) => (
                    <circle key={jours[i]?.day ?? x} cx={x} cy={y} r="3.4" fill="currentColor" />
                  ))}
                </>
              )}
            </svg>
            <figcaption>
              {labels.map((d) => (
                <span key={d.day}>{dateLisible(d.day, "short")}</span>
              ))}
            </figcaption>
          </figure>
          <details className="pg-chart-data">
            <summary>Détail par jour</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Tickets</th>
                  <th scope="col">Ventes</th>
                </tr>
              </thead>
              <tbody>
                {jours.map((j) => (
                  <tr key={j.day}>
                    <td>{dateLisible(j.day)}</td>
                    <td>{j.tickets}</td>
                    <td>{dinars(j.ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
