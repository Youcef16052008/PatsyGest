"use client";
import { useId, useState } from "react";
import { dateLisible, dinars, type VentesJour } from "@/lib/workspace-data";
import { Notice } from "./workspace-ui";

export default function SalesChart({ series }: { series: VentesJour[] | null }) {
  const id = useId();
  const [period, setPeriod] = useState(7);
  const jours = series?.slice(-period) ?? [];
  const somme = jours.reduce((s, d) => s + Math.round(d.ttc * 100), 0) / 100;
  const max = Math.max(1, ...jours.map(d => d.ttc));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const ceiling = Math.ceil(max / step) * step;
  const plot = jours.map((d,i) => [i * 548 / Math.max(1, jours.length - 1), 141 - 128 * d.ttc / ceiling]);
  const points = plot.map(([x,y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const labels = jours.filter((_,i) => [0, Math.floor((jours.length-1)/2), jours.length-1].includes(i));
  return <section className="pg-card pg-card-pad pg-chart-card" aria-labelledby={`${id}-title`}>
    <div className="pg-card-head"><div><h2 id={`${id}-title`}>Ventes TTC</h2><p>Évolution des ventes enregistrées</p></div>
      <div className="pg-segment" role="group" aria-label="Période des ventes">{[7,14].map(p => <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>{p} j</button>)}</div></div>
    {!series ? <Notice kind="warning">Les ventes de la période sont indisponibles.</Notice> : <>
      <div className="pg-chart-amount"><strong>{dinars(somme, false)}</strong><span>{period} derniers jours</span></div>
      <figure className="pg-chart" aria-label={`Évolution du total TTC sur ${period} jours : ${dinars(somme)} au total`}>
        <div className="pg-chart-axis" aria-hidden="true">{[1,.75,.5,.25,0].map(x => <span key={x}>{new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(ceiling*x)}</span>)}</div>
        <svg viewBox="-4 0 556 145" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={`${id}-fill`} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".25"/><stop offset="1" stopColor="currentColor" stopOpacity=".04"/></linearGradient></defs>
          {[13,45,77,109,141].map(y => <path className="pg-chart-gridline" key={y} d={`M0 ${y}H548`} vectorEffect="non-scaling-stroke"/>)}
          <polygon fill={`url(#${id}-fill)`} points={`0,141 ${points} 548,141`}/>
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          {plot.map(([x,y]) => <circle key={x} cx={x} cy={y} r="3" fill="currentColor"/>)}
        </svg>
        <figcaption>{labels.map(d => <span key={d.day}>{dateLisible(d.day, "short")}</span>)}</figcaption>
      </figure>
      <details className="pg-chart-data"><summary>Détail par jour</summary><table><thead><tr><th scope="col">Date</th><th scope="col">Ventes TTC</th></tr></thead><tbody>
        {jours.map(j => <tr key={j.day}><td>{dateLisible(j.day)}</td><td>{dinars(j.ttc)}</td></tr>)}
      </tbody></table></details>
    </>}
  </section>;
}
