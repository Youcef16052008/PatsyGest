"use client";

import { useActionState, useState } from "react";
import { createAvoir, type AvoirState } from "@/lib/actions-caisse";
import { dinars, type SaleSummary } from "@/lib/workspace-data";
import { Notice } from "./workspace-ui";

/**
 * US-06.4 — retour/avoir.
 *
 * Le vendeur choisit la vente, la quantité rendue et surtout **ce que devient
 * la marchandise**. C'est le point que le CDC ne veut pas laisser implicite :
 * remise en stock (elle redevient vendable) ou destruction (la perte est
 * consignée et mesurée). Le formulaire n'a pas d'option par défaut sélectionnée
 * pour forcer ce choix.
 */
export default function AvoirForm({ ventes }: { ventes: SaleSummary[] }) {
  const [state, action, pending] = useActionState<AvoirState, FormData>(createAvoir, {});
  const [venteId, setVenteId] = useState("");
  const [mode, setMode] = useState<"" | "remise_en_stock" | "destruction">("");
  const [qte, setQte] = useState("1");

  const vente = ventes.find((v) => v.id === venteId);
  const produit = vente?.items[0];
  const maxQte = produit?.quantity ?? 0;

  return (
    <form action={action} className="pg-form">
      <div className="pg-field">
        <label htmlFor="avoir-vente">Vente concernée</label>
        <select
          id="avoir-vente"
          name="venteId"
          required
          value={venteId}
          onChange={(e) => setVenteId(e.target.value)}
        >
          <option value="">— Choisir le ticket —</option>
          {ventes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.numero ?? "Ticket"} · {(v.items[0]?.name ?? "Vente")} · {dinars(v.totalTTC)}
            </option>
          ))}
        </select>
      </div>

      {vente ? (
        <div className="pg-field">
          <label htmlFor="avoir-qte">Quantité rendue{maxQte > 0 ? ` (vendu : ${maxQte})` : ""}</label>
          <input
            id="avoir-qte"
            name="qte"
            type="number"
            step="0.001"
            min="0.001"
            max={maxQte > 0 ? maxQte : undefined}
            value={qte}
            onChange={(e) => setQte(e.target.value)}
            required
          />
          <p className="pg-muted">
            Le serveur refusera toute quantité supérieure à ce qui a été vendu, avoirs déjà
            enregistrés déduits.
          </p>
        </div>
      ) : (
        <input type="hidden" name="qte" value={qte} />
      )}

      <fieldset className="pg-field">
        <legend>Que devient la marchandise ?</legend>
        <label className="pg-choice">
          <input
            type="radio"
            name="mode"
            value="remise_en_stock"
            checked={mode === "remise_en_stock"}
            onChange={() => setMode("remise_en_stock")}
            required
          />
          <span>
            <strong>Remise en stock</strong> — le produit redevient vendable, dans son lot
            d’origine ou dans un lot de retour dédié.
          </span>
        </label>
        <label className="pg-choice">
          <input
            type="radio"
            name="mode"
            value="destruction"
            checked={mode === "destruction"}
            onChange={() => setMode("destruction")}
            required
          />
          <span>
            <strong>Destruction</strong> — le produit n’est pas remis en vente ; la perte est
            consignée dans les mouvements et reste comptée dans le bilan.
          </span>
        </label>
        {!mode ? (
          <p className="pg-muted">Choisissez explicitement : aucun devenir n’est appliqué par défaut.</p>
        ) : null}
      </fieldset>

      <div className="pg-field">
        <label htmlFor="avoir-motif">Motif</label>
        <input
          id="avoir-motif"
          name="motif"
          required
          minLength={3}
          maxLength={500}
          placeholder="Ex. : client a changé d’avis, produit tombé, erreur de saisie…"
        />
      </div>

      <button type="submit" className="pg-button pg-button-primary" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer l’avoir"}
      </button>

      {state.erreur ? <Notice kind="error">{state.erreur}</Notice> : null}
      {state.succes ? <Notice kind="success">{state.succes}</Notice> : null}

      <p className="pg-muted">
        Un avoir ne supprime pas la vente d’origine : il la corrige. C’est ce qui permet de
        justifier un écart de caisse lors d’un contrôle.
      </p>
    </form>
  );
}
