"use client";

import { useActionState, useId, useState } from "react";
import { createArticle, receiveLot } from "@/lib/actions-stock";
import { jourLocal } from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";

type Option = { id: string; label: string; unite?: string };

const field = "pg-input";
const label = "pg-field";

/**
 * Deux gestes seulement, en clair :
 *   1. « Ça vient d'arriver »  → un article, une quantité, un prix d'achat.
 *   2. « Nouvel article »      → un nom et un prix de vente.
 *
 * Tout le reste (code article, seuil, TVA, allergènes, fournisseur, n° de lot,
 * DLC…) est replié derrière « Plus d'options » : nécessaire parfois, jamais
 * tous les jours. Les champs restent les mêmes noms de formulaire, donc les
 * Server Actions et la RLS ne changent pas.
 */
export default function StockWriteForms({
  articles,
  sites,
  fournisseurs,
  role = "proprietaire",
}: {
  articles: Option[];
  sites: Option[];
  fournisseurs: Option[];
  role?: "proprietaire" | "labo" | "vendeur";
}) {
  const [artState, artAction, artPending] = useActionState(createArticle, {});
  const [recState, recAction, recPending] = useActionState(receiveLot, {});
  const [modale, setModale] = useState<"reception" | "article" | null>(null);
  const [articleChoisi, setArticleChoisi] = useState("");
  const [plusArticle, setPlusArticle] = useState(false);
  const [plusReception, setPlusReception] = useState(false);
  const [code, setCode] = useState("");
  const isLabo = role === "labo";
  const vide = articles.length === 0 || sites.length === 0;
  const uniteChoisie = articles.find((a) => a.id === articleChoisi)?.unite ?? "";
  // Valeurs par défaut stables entre serveur et navigateur (`useId`) : l'utilisateur
  // n'a pas à inventer un code article ni un numéro de bon. Il peut les changer
  // dans « Plus d'options ».
  const jeton = useId().replace(/[^a-z0-9]/gi, "").slice(-5).toUpperCase() || "00001";
  const codeAuto = `ART-${jeton}`;
  const numeroAuto = `BON-${jourLocal().slice(0, 4)}-${jeton}`;

  function ouvrir(quoi: "reception" | "article") {
    setModale(quoi);
    setPlusArticle(false);
    setPlusReception(false);
  }

  return (
    <section className="pg-card pg-card-pad pg-stock-actions" aria-label="Entrée de stock">
      <div className="pg-card-head">
        <div>
          <h2>Que voulez-vous faire ?</h2>
          <p>Deux gestes suffisent : ce qui arrive, ou un nouveau produit.</p>
        </div>
      </div>

      {vide ? (
        <p className="pg-notice" data-kind="warning">
          Créez d’abord un article et un site pour pouvoir entrer du stock.
        </p>
      ) : (
        <div className="pg-stock-action-buttons">
          <button type="button" className="pg-stock-action" aria-pressed={modale === "reception"} onClick={() => ouvrir("reception")}>
            <span className="pg-emblem"><Icon name="box" size={20} /></span>
            <span>
              <b>Ça vient d’arriver</b>
              <small>Farine, beurre, gâteaux reçus…</small>
            </span>
          </button>
          <button type="button" className="pg-stock-action" aria-pressed={modale === "article"} onClick={() => ouvrir("article")}>
            <span className="pg-emblem"><Icon name="plus" size={20} /></span>
            <span>
              <b>Nouvel article</b>
              <small>Un produit ou un ingrédient à vendre</small>
            </span>
          </button>
        </div>
      )}

      {modale === "reception" && (
        <form action={recAction} className="pg-stock-form">
          <p className="pg-stock-form-title">Ce qui vient d’arriver</p>
          <label className={label}>
            Quel article ?
            <select
              name="articleId"
              required
              className={field}
              value={articleChoisi}
              onChange={(e) => setArticleChoisi(e.target.value)}
            >
              <option value="">— choisir —</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
          <div className="pg-stock-form-row">
            <label className={label}>
              Combien {uniteChoisie ? `(${uniteChoisie})` : "?"}
              <input name="qte" type="number" inputMode="decimal" min={0.0001} step="any" required placeholder="0" className={field} />
            </label>
            {isLabo ? (
              <input type="hidden" name="pu" value="0" />
            ) : (
              <label className={label}>
                Prix d’achat (DA)
                <input name="pu" type="number" inputMode="decimal" min={0} step="0.01" required placeholder="0" className={field} />
              </label>
            )}
            <label className={label}>
              Où ?
              <select name="siteId" required className={field} defaultValue={sites[0]?.id ?? ""}>
                {sites.length === 0 && <option value="">Aucun site</option>}
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            className="pg-text-link pg-stock-plus"
            aria-expanded={plusReception}
            onClick={() => setPlusReception(!plusReception)}
          >
            Plus d’options (n° de bon, DLC, fournisseur)
          </button>
          {!plusReception && <input type="hidden" name="numero" value={numeroAuto} />}
          {plusReception && (
            <div className="pg-stock-form-row">
              <label className={label}>
                N° de bon / facture
                <input name="numero" maxLength={80} defaultValue={numeroAuto} className={field} />
              </label>
              <label className={label}>
                À consommer avant <span className="pg-hint">facultatif</span>
                <input name="dlc" type="date" className={field} />
              </label>
              <label className={label}>
                Fournisseur <span className="pg-hint">facultatif</span>
                <select name="fournisseurId" className={field} defaultValue="">
                  <option value="">—</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Référence <span className="pg-hint">facultatif</span>
                <input name="ref" maxLength={80} className={field} />
              </label>
            </div>
          )}

          {recState.erreur && <p role="alert" className="pg-notice" data-kind="error">{recState.erreur}</p>}
          {recState.succes && <p role="status" className="pg-notice" data-kind="success">{recState.succes}</p>}

          <div className="pg-stock-form-actions">
            <button disabled={recPending || vide} className="pg-button">
              {recPending ? "Enregistrement…" : "C’est entré en stock"}
            </button>
            <button type="button" className="pg-button pg-button-secondary" onClick={() => setModale(null)}>
              Fermer
            </button>
          </div>
        </form>
      )}

      {modale === "article" && (
        <form action={artAction} className="pg-stock-form">
          <p className="pg-stock-form-title">Nouvel article</p>
          <div className="pg-stock-form-row">
            <label className={`${label} pg-stock-form-wide`}>
              Nom
              <input name="nom" required maxLength={120} placeholder="Ex : Mille-feuille, Farine T45…" className={field} />
            </label>
            <label className={label}>
              C’est…
              <select name="niveau" defaultValue="produit" className={field}>
                <option value="produit">Un gâteau à vendre</option>
                <option value="matiere">Un ingrédient</option>
              </select>
            </label>
            <label className={label}>
              Unité
              <select name="unite" defaultValue="pcs" className={field}>
                <option value="pcs">pièces</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">litres</option>
                <option value="ml">ml</option>
              </select>
            </label>
            <label className={label}>
              {isLabo ? "Prix proposé au patron (DA)" : "Prix de vente (DA)"}
              <input name="prix_ttc" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={0} className={field} />
            </label>
          </div>

          {isLabo && (
            <input type="hidden" name="tva" value="0" />
          )}

          <button
            type="button"
            className="pg-text-link pg-stock-plus"
            aria-expanded={plusArticle}
            onClick={() => setPlusArticle(!plusArticle)}
          >
            Plus d’options (code, seuil d’alerte, TVA, allergènes)
          </button>
          {!plusArticle && <input type="hidden" name="code" value={codeAuto} />}
          {plusArticle && (
            <div className="pg-stock-form-row">
              <label className={label}>
                Code article <span className="pg-hint">pour vos fiches</span>
                <input name="code" maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder={codeAuto} className={field} />
              </label>
              <label className={label}>
                Alerter sous… <span className="pg-hint">0 = jamais</span>
                <input name="seuil" type="number" min={0} step="any" defaultValue={0} className={field} />
              </label>
              {!isLabo && (
                <label className={label}>
                  TVA
                  <select name="tva" defaultValue="19" className={field}>
                    <option value="19">19 % — pâtisserie, gâteaux</option>
                    <option value="9">9 % — farine, lait, œufs, sucre</option>
                    <option value="0">0 % — exonéré / artisan</option>
                  </select>
                </label>
              )}
              <label className={label}>
                Allergènes <span className="pg-hint">séparés par des virgules</span>
                <input name="allergenes" maxLength={500} placeholder="gluten, œufs" className={field} />
              </label>
              <label className={label}>
                Traces <span className="pg-hint">facultatif</span>
                <input name="traces" maxLength={500} placeholder="fruits à coque" className={field} />
              </label>
            </div>
          )}

          {isLabo && (
            <p className="pg-hint">
              Le produit sera créé au catalogue labo et transmis au propriétaire pour validation du prix.
            </p>
          )}
          {artState.erreur && <p role="alert" className="pg-notice" data-kind="error">{artState.erreur}</p>}
          {artState.succes && <p role="status" className="pg-notice" data-kind="success">{artState.succes}</p>}

          <div className="pg-stock-form-actions">
            <button disabled={artPending} className="pg-button">
              {artPending ? "Création…" : "Créer l’article"}
            </button>
            <button type="button" className="pg-button pg-button-secondary" onClick={() => setModale(null)}>
              Fermer
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
