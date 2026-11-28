"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { accepterCgvReal, assignCakeProductionReal, createCakeReal, editerCakeReal, evolveCakeReal } from "@/lib/actions-cakes";
import { clearEstimatorDraft, ESTIMATOR_DRAFT_KEY, loadEstimatorDraft } from "@/lib/portion-estimator";
import { traiterDemandeVitrine } from "@/lib/actions-vitrine";
import { peutTraiterDemande, type Role } from "@/lib/vitrine-permissions";
import { canCreateOrEditCakeQuotes, canSellAtPos } from "@/lib/permissions";
import CakeTicket from "./cake-ticket";
import { cakeConnectedTotals } from "@/lib/cake-money";
import { whatsappOrderUrl } from "@/lib/whatsapp";
import { compareCakePriority } from "@/lib/cake-priority";
import { Tr } from "./locale-provider";
import { Icon } from "./workspace-icons";

function subscribeDraft(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getDraftRaw() {
  try { return window.localStorage.getItem(ESTIMATOR_DRAFT_KEY); } catch { return null; }
}

export type CakeRow = {
  id: string; numero: string; statut: string; ofId: string | null; clientNom: string;
  telephone: string | null; dateEvent: string; nbParts: number;
  prixHt: number; tvaPct: number; acompte: number;
  notes: string | null; cgv: boolean; cgvVersion: string | null; versionId: string | null; ofNumero: string | null; lots: { numero: string }[];
  origineVitrine?: boolean;
};

type Opt = { name: string; cout: string; minutes: string };

type RecipeOption = { version_id: string; nom: string; version: number; rendement_qte: number; rendement_unite: string };
type SiteOption = { id: string; nom: string };

const dateFr = (d: string) => {
  const v = new Date(`${d}T12:00:00`);
  return Number.isNaN(v.getTime()) ? d : v.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};
const da = (n: number) => `${Math.round(Number(n)).toLocaleString("fr-FR")} DA`;

const STATUTS: Record<string, [fr: string, ar: string]> = {
  devis: ["Devis", "عرض"],
  acompte: ["Acompte reçu", "تسبيق مستلم"],
  confirme: ["Confirmé", "مؤكدة"],
  produit: ["Prêt", "واجدة"],
  livre: ["Livré", "تسلّمت"],
  annule: ["Annulé", "ملغاة"],
  demande: ["Demande", "طلب"],
};
const Statut = ({ code }: { code: string }) => {
  const [fr, ar] = STATUTS[code] ?? [code, code];
  return <Tr fr={fr} ar={ar} />;
};

/**
 * Commandes & Gâteaux, version comptoir :
 *   1. une demande de la vitrine → « Accepter » ;
 *   2. le patron écrit un nouveau gâteau en 6 cases ;
 *   3. chaque dossier n'affiche QUE la prochaine chose à faire.
 */
export default function CakeForms({ cakes, recipes, sites, optionsError, role }: { cakes: CakeRow[]; recipes: RecipeOption[]; sites: SiteOption[]; optionsError: boolean; role: Role }) {
  const [assignState, assignAction, assignPending] = useActionState(assignCakeProductionReal, {});
  const [createState, createAction, pending] = useActionState(createCakeReal, {});
  const [evolveState, evolveAction, evolvePending] = useActionState(evolveCakeReal, {});
  const [editState, editAction, editPending] = useActionState(editerCakeReal, {});
  const [cgvState, cgvAction, cgvPending] = useActionState(accepterCgvReal, {});
  const [demandeState, demandeAction, demandePending] = useActionState(traiterDemandeVitrine, {});
  const [opts, setOpts] = useState<Opt[]>([]);
  const [payId, setPayId] = useState("");
  const [editId, setEditId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const rawDraft = useSyncExternalStore(subscribeDraft, getDraftRaw, () => null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const draft = rawDraft && !draftDismissed ? loadEstimatorDraft() : null;
  const [nbPartsVal, setNbPartsVal] = useState("10");
  const [prixHtVal, setPrixHtVal] = useState("");
  const [notesVal, setNotesVal] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const demandes = cakes
    .filter((c) => c.statut === "demande")
    .sort((a, b) => a.dateEvent.localeCompare(b.dateEvent));
  const autres = cakes.filter((c) => c.statut !== "demande");
  const sorted = [...autres].sort((a, b) => compareCakePriority({ status: a.statut, date: a.dateEvent, numero: a.numero }, { status: b.statut, date: b.dateEvent, numero: b.numero }));
  const peutTraiter = peutTraiterDemande(role);
  const canCreateOrEditQuotes = canCreateOrEditCakeQuotes(role);
  const peutEncaisser = canCreateOrEditQuotes || canSellAtPos(role);
  const enCours = sorted.filter((c) => !["livre", "annule"].includes(c.statut));
  const termines = sorted.filter((c) => ["livre", "annule"].includes(c.statut));

  function appliquerBrouillon() {
    if (!draft) return;
    setNbPartsVal(String(Math.max(1, Math.min(10000, Math.round(draft.parts)))));
    if (!draft.coutIncomplet && draft.prixHtPropose != null && draft.prixHtPropose > 0) {
      setPrixHtVal(String(draft.prixHtPropose));
    }
    setNotesVal((prev) => (prev ? `${prev}\n${draft.noteDevis}` : draft.noteDevis).slice(0, 500));
    setDraftNotice("Le calcul du moule est repris ci-dessous. Vérifiez le prix avant de créer.");
  }

  return (
    <div className="pg-stack">
      {/* 1 — ce qui attend une réponse */}
      {demandes.length > 0 && (
        <section className="pg-card pg-card-pad pg-cake-demands">
          <div className="pg-card-head">
            <div>
              <h2><Tr fr="Demandes de la vitrine" ar="طلبات من الواجهة" /></h2>
              <p><Tr fr="Le client a commandé en ligne. Acceptez : le gâteau devient un devis à chiffrer." ar="العميل طلب من الأنترنت. اقبل : تولّي الحلوة طلبية لازم تحدّد سعرها." /></p>
            </div>
            <span className="pg-badge" data-tone="warning">{demandes.length}</span>
          </div>
          <ul className="pg-cake-demand-list">
            {demandes.map((c) => (
              <li key={c.id}>
                <div className="pg-cake-demand-copy">
                  <strong>{c.clientNom}</strong>
                  <span>{c.nbParts} <Tr fr="parts" ar="حصة" /> · {dateFr(c.dateEvent)}</span>
                  {c.telephone && <a href={`tel:${c.telephone}`} className="pg-text-link">{c.telephone}</a>}
                  {c.notes && <em>{c.notes}</em>}
                </div>
                {peutTraiter ? (
                  <form action={demandeAction} className="pg-cake-demand-actions">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" name="decision" value="accepter" disabled={demandePending} className="pg-button">
                      <Icon name="check" size={17} /> <Tr fr="Accepter" ar="اقبل" />
                    </button>
                    <button type="submit" name="decision" value="refuser" disabled={demandePending} className="pg-button pg-button-secondary">
                      <Tr fr="Refuser" ar="ارفض" />
                    </button>
                  </form>
                ) : (
                  <p className="pg-help"><Tr fr="Le patron répond à cette demande." ar="صاحب المحل هو اللي يجاوب على هذا الطلب." /></p>
                )}
              </li>
            ))}
          </ul>
          {demandeState.erreur && <p role="alert" className="pg-form-error">{demandeState.erreur}</p>}
          {demandeState.succes && <p role="status" className="pg-form-ok">{demandeState.succes}</p>}
        </section>
      )}

      {/* 2 — écrire un gâteau */}
      {canCreateOrEditQuotes ? (
        <section className="pg-card pg-card-pad">
          <div className="pg-card-head">
            <div>
              <h2><Tr fr="Nouveau gâteau sur commande" ar="حلوة جديدة بطلبية" /></h2>
              <p><Tr fr="Six cases suffisent : qui, quand, combien de parts, quel prix." ar="ستّة خانات تكفي : شكون، وقتاش، قداش من حصة، وبقداش." /></p>
            </div>
            <Link href="/estimation" className="pg-text-link">
              <Tr fr="Calculer le moule et le prix" ar="احسب القالب والسعر" /> <Icon name="arrow" size={15} />
            </Link>
          </div>

          {draft && (
            <div className="pg-cake-draft">
              <span>
                <b><Tr fr="Un calcul vous attend :" ar="عندك حساب واجد :" /></b> {draft.modeleNom} · {draft.parts} <Tr fr="parts" ar="حصة" /> · {draft.formatLabel}
                {!draft.coutIncomplet && draft.prixHtPropose != null ? ` · ${da(draft.prixHtPropose)}` : ""}
              </span>
              <span className="pg-cake-draft-actions">
                <button type="button" onClick={appliquerBrouillon} className="pg-button"><Tr fr="Reprendre" ar="استعملو" /></button>
                <button type="button" onClick={() => { clearEstimatorDraft(); setDraftDismissed(true); setDraftNotice(null); }} className="pg-button pg-button-secondary"><Tr fr="Effacer" ar="امسح" /></button>
              </span>
            </div>
          )}
          {draftNotice && <p role="status" className="pg-form-ok">{draftNotice}</p>}
          {!optionsError && (!recipes.length || !sites.length) && (
            <p className="pg-help">
              <Tr fr="Il faut une recette avec ses ingrédients et un site pour lier la fabrication." ar="لازم وصفة فيها المكونات ومكان التصنيع." />
            </p>
          )}
          {optionsError && <p role="alert" className="pg-form-error"><Tr fr="Les recettes ne sont pas disponibles. Vérifiez la connexion." ar="الوصفات ما راهيش متاحة. تحقق من الاتصال." /></p>}

          <form action={createAction} className="pg-cake-form">
            <input type="hidden" name="optionCount" value={opts.length} />
            <label className="pg-field pg-cake-wide">
              <Tr fr="Nom du client" ar="اسم العميل" />
              <input name="clientNom" required maxLength={100} autoComplete="off" className="pg-input" placeholder="Ex : famille Benali" />
            </label>
            <label className="pg-field">
              <Tr fr="Téléphone" ar="الهاتف" />
              <input name="telephone" type="tel" maxLength={40} className="pg-input" placeholder="0550 00 00 00" />
            </label>
            <label className="pg-field">
              <Tr fr="Date de retrait" ar="تاريخ السحب" />
              <input name="dateEvent" type="date" min="2000-01-04" required className="pg-input" />
            </label>
            <label className="pg-field">
              <Tr fr="Nombre de parts" ar="عدد الحصص" />
              <input name="nbParts" type="number" min={1} max={10000} required value={nbPartsVal} onChange={(e) => setNbPartsVal(e.target.value)} className="pg-input" />
            </label>
            <label className="pg-field">
              <Tr fr="Prix total (DA)" ar="السعر الكلي (دج)" />
              <input name="prixHt" type="number" step="any" min={0.01} required value={prixHtVal} onChange={(e) => setPrixHtVal(e.target.value)} className="pg-input" placeholder="4500" />
            </label>
            <label className="pg-field pg-cake-wide">
              <Tr fr="Quel gâteau ?" ar="أشمن حلوة ؟" />
              <select name="versionId" required className="pg-input" defaultValue="">
                <option value="">Choisir une recette</option>
                {recipes.map((r) => (
                  <option key={r.version_id} value={r.version_id}>
                    {r.nom} · {r.rendement_qte} {r.rendement_unite}
                  </option>
                ))}
              </select>
            </label>
            <label className="pg-field">
              <Tr fr="Préparé où ?" ar="يتحضّر فين ؟" />
              <select name="siteId" required className="pg-input" defaultValue="">
                <option value="">Choisir</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </label>
            <label className="pg-field">
              <Tr fr="Combien ?" ar="قداش ؟" />
              <input name="qteFabrication" type="number" min="0.001" max="100000000" step="0.001" defaultValue={1} required className="pg-input" />
            </label>
            <label className="pg-field pg-cake-wide">
              <Tr fr="Heure de retrait, inscription, thème…" ar="وقت السحب، الكتابة، الثيم…" />
              <input name="notes" maxLength={500} value={notesVal} onChange={(e) => setNotesVal(e.target.value)} className="pg-input" placeholder="Ex : retrait 15h · Joyeux anniversaire" />
            </label>

            <details className="pg-cake-more pg-cake-wide">
              <summary><Tr fr="Options et conditions (pas obligatoire)" ar="خيارات وشروط (ماشي إجباري)" /></summary>
              <div className="pg-cake-more-body">
                <label className="pg-check">
                  <input name="cgv" type="checkbox" defaultChecked className="h-4 w-4" />
                  <Tr fr="Le client accepte les conditions (acompte 30 %)" ar="العميل وافق على الشروط (تسبيق 30٪)" />
                </label>
                <div className="pg-cake-options">
                  {opts.map((o, i) => (
                    <div key={i} className="pg-cake-option">
                      <label className="pg-field">
                        <Tr fr="Option" ar="خيار" />
                        <input name={`opt${i}_name`} required maxLength={100} value={o.name} onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="pg-input" placeholder="Ex : topper" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Coût (DA)" ar="التكلفة (دج)" />
                        <input name={`opt${i}_cout`} type="number" step="any" min={0} required value={o.cout} onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, cout: e.target.value } : x)))} className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Minutes" ar="دقائق" />
                        <input name={`opt${i}_minutes`} type="number" min={0} required value={o.minutes} onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))} className="pg-input" />
                      </label>
                      <button type="button" onClick={() => setOpts((os) => os.filter((_, j) => j !== i))} className="pg-text-link pg-cake-option-remove">
                        <Tr fr="Retirer" ar="حيّد" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setOpts((o) => [...o, { name: "", cout: "", minutes: "" }])} className="pg-text-link">
                    + <Tr fr="Ajouter une option" ar="زيد خيار" />
                  </button>
                </div>
              </div>
            </details>

            <button disabled={pending || optionsError || !recipes.length || !sites.length} className="pg-button pg-cake-submit">
              {pending ? "…" : <><Icon name="check" size={18} /> <Tr fr="Créer la commande" ar="أُنشئ الطلبية" /></>}
            </button>
            {createState.erreur && <p role="alert" className="pg-form-error pg-cake-wide">{createState.erreur}</p>}
            {createState.succes && <p role="status" className="pg-form-ok pg-cake-wide">{createState.succes}</p>}
          </form>
        </section>
      ) : (
        <section className="pg-card pg-card-pad pg-help">
          <Tr fr="Espace comptoir : vous encaissez les acomptes, confirmez et livrez. Le patron crée les devis." ar="فضاء البيع : تحصّل التسبيق، تأكد وتسلم. صاحب المحل هو اللي يكتب الطلبيات." />
        </section>
      )}

      {/* 3 — les commandes, une action à la fois */}
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2><Tr fr="Commandes en cours" ar="الطلبيات الجارية" /></h2>
            <p><Tr fr="Le retrait le plus proche d’abord. Un seul bouton par commande." ar="الأقرب سحباً في الأول. زر واحد لكل طلبية." /></p>
          </div>
          <span className="pg-badge">{enCours.length}</span>
        </div>

        {enCours.length === 0 ? (
          <p className="pg-muted"><Tr fr="Aucune commande en cours." ar="ما كاين حتى طلبية جارية." /></p>
        ) : (
          <ul className="pg-cake-list">
            {enCours.map((c) => {
              const totals = cakeConnectedTotals(Number(c.prixHt), Number(c.tvaPct), Number(c.acompte));
              const wa = whatsappOrderUrl({
                phone: c.telephone,
                client: c.clientNom,
                numero: c.numero,
                eventDate: c.dateEvent,
                parts: c.nbParts,
                resteDa: totals.balance,
              });
              return (
                <li key={c.id} className="pg-cake-item">
                  <form action={evolveAction} className="pg-cake-item-form">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="pg-cake-item-top">
                      <div className="pg-cake-item-copy">
                        <strong>{c.clientNom}</strong>
                        <span>{dateFr(c.dateEvent)} · {c.nbParts} <Tr fr="parts" ar="حصة" /> · {c.numero}</span>
                      </div>
                      <span className="pg-badge"><Statut code={c.statut} /></span>
                    </div>

                    <div className="pg-cake-money">
                      <div><small><Tr fr="Prix" ar="السعر" /></small><b>{da(totals.ttc)}</b></div>
                      <div><small><Tr fr="Acompte" ar="التسبيق" /></small><b>{da(Number(c.acompte))}</b></div>
                      <div data-reste={totals.balance > 0 || undefined}><small><Tr fr="Reste" ar="الباقي" /></small><b>{da(totals.balance)}</b></div>
                    </div>

                    <div className="pg-cake-actions">
                      {peutEncaisser && totals.balance > 0 && c.statut !== "produit" && (
                        <button type="button" onClick={() => setPayId(payId === c.id ? "" : c.id)} className="pg-button pg-button-secondary">
                          <Icon name="receipt" size={16} /> <Tr fr="Encaisser" ar="تحصيل" />
                        </button>
                      )}
                      {c.statut === "acompte" && canCreateOrEditQuotes && (
                        <button type="submit" name="transition" value="confirme" disabled={evolvePending} className="pg-button">
                          <Icon name="check" size={16} /> <Tr fr="Confirmer" ar="أكّد" />
                        </button>
                      )}
                      {c.statut === "confirme" && (canCreateOrEditQuotes || role === "labo") && (
                        <button type="submit" name="transition" value="produit" disabled={evolvePending} className="pg-button">
                          <Icon name="cake" size={16} /> <Tr fr="Gâteau prêt" ar="الحلوة واجدة" />
                        </button>
                      )}
                      {c.statut === "produit" && peutEncaisser && (
                        <button type="submit" name="transition" value="livre" disabled={evolvePending || totals.balance > 0} title={totals.balance > 0 ? "Reste à payer avant de livrer" : undefined} className="pg-button">
                          <Icon name="check" size={16} /> <Tr fr="Livré" ar="تسلّمت" />
                        </button>
                      )}
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="pg-button pg-button-secondary">
                          WhatsApp
                        </a>
                      )}
                    </div>

                    {payId === c.id && (
                      <div className="pg-cake-pay">
                        <label className="pg-field">
                          <Tr fr="Montant reçu (DA)" ar="المبلغ المستلم (دج)" />
                          <input name="montant" type="number" step="any" min={0.01} max={totals.balance} required className="pg-input" autoFocus />
                        </label>
                        <button type="submit" name="transition" value="payer" disabled={evolvePending} className="pg-button">
                          <Icon name="check" size={16} /> <Tr fr="Enregistrer" ar="سجّل" />
                        </button>
                      </div>
                    )}
                  </form>

                  <details className="pg-cake-details">
                    <summary><Tr fr="Plus" ar="زيادة" /></summary>
                    <div className="pg-cake-details-body">
                      {canCreateOrEditQuotes && c.statut === "devis" && (
                        <button type="button" onClick={() => setEditId(editId === c.id ? "" : c.id)} className="pg-button pg-button-secondary">
                          <Tr fr="Changer le prix" ar="بدّل السعر" />
                        </button>
                      )}
                      <button type="button" onClick={() => setTicketId(ticketId === c.id ? "" : c.id)} className="pg-button pg-button-secondary">
                        <Icon name="receipt" size={16} /> <Tr fr="Ticket" ar="التذكرة" />
                      </button>
                      {c.telephone && <a href={`tel:${c.telephone}`} className="pg-button pg-button-secondary">{c.telephone}</a>}
                      {canCreateOrEditQuotes && (
                        <button
                          type="submit"
                          name="transition"
                          value="annule"
                          disabled={evolvePending || !!c.ofId}
                          onClick={(e) => { if (!window.confirm("Annuler cette commande ? Aucun remboursement automatique.")) e.preventDefault(); }}
                          className="pg-button pg-button-secondary pg-danger"
                        >
                          <Tr fr="Annuler la commande" ar="ألغي الطلبية" />
                        </button>
                      )}
                      {c.notes && <p className="pg-help">{c.notes}</p>}
                      {c.ofNumero && <p className="pg-help">OF {c.ofNumero} · {c.lots.map((l) => l.numero).join(", ") || "aucun lot"}</p>}
                      {!c.cgv && (
                        <form action={cgvAction} className="pg-cake-cgv">
                          <input type="hidden" name="id" value={c.id} />
                          <label className="pg-field">
                            <Tr fr="Version des conditions" ar="نسخة الشروط" />
                            <input name="version" required maxLength={50} defaultValue="CGV-2026-v1" className="pg-input" />
                          </label>
                          <button disabled={cgvPending} className="pg-button pg-button-secondary"><Tr fr="Noter l’accord" ar="سجّل الموافقة" /></button>
                        </form>
                      )}
                    </div>
                  </details>

                  {!c.versionId && ["devis", "acompte"].includes(c.statut) && canCreateOrEditQuotes && (
                    <form action={assignAction} className="pg-cake-assign">
                      <p className="pg-help"><Tr fr="Ancien devis : il faut choisir la recette avant de confirmer." ar="طلبية قديمة : لازم تختار الوصفة قبل التأكيد." /></p>
                      <input type="hidden" name="id" value={c.id} />
                      <label className="pg-field">
                        <Tr fr="Quel gâteau ?" ar="أشمن حلوة ؟" />
                        <select name="versionId" required className="pg-input" defaultValue="">
                          <option value="">Choisir</option>
                          {recipes.map((r) => <option key={r.version_id} value={r.version_id}>{r.nom}</option>)}
                        </select>
                      </label>
                      <label className="pg-field">
                        <Tr fr="Combien ?" ar="قداش ؟" />
                        <input name="qteFabrication" type="number" min="0.001" max="100000000" step="0.001" defaultValue={1} required className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Préparé où ?" ar="يتحضّر فين ؟" />
                        <select name="siteId" required className="pg-input" defaultValue="">
                          <option value="">Choisir</option>
                          {sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                      </label>
                      <button disabled={assignPending || optionsError} className="pg-button"><Tr fr="Associer" ar="اربط" /></button>
                    </form>
                  )}

                  {editId === c.id && canCreateOrEditQuotes && (
                    <form action={editAction} className="pg-cake-edit">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="tvaPct" value={c.tvaPct} />
                      <label className="pg-field">
                        <Tr fr="Client" ar="العميل" />
                        <input name="clientNom" required maxLength={100} defaultValue={c.clientNom} className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Téléphone" ar="الهاتف" />
                        <input name="telephone" maxLength={40} defaultValue={c.telephone ?? ""} className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Date de retrait" ar="تاريخ السحب" />
                        <input name="dateEvent" type="date" required defaultValue={c.dateEvent} className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Nombre de parts" ar="عدد الحصص" />
                        <input name="nbParts" type="number" min={1} max={10000} required defaultValue={c.nbParts} className="pg-input" />
                      </label>
                      <label className="pg-field">
                        <Tr fr="Prix total (DA)" ar="السعر الكلي (دج)" />
                        <input name="prixHt" type="number" step="any" min={0.01} required defaultValue={c.prixHt} className="pg-input" />
                      </label>
                      <label className="pg-field pg-cake-wide">
                        <Tr fr="Notes" ar="ملاحظات" />
                        <input name="notes" maxLength={500} defaultValue={c.notes ?? ""} className="pg-input" />
                      </label>
                      <div className="pg-cake-edit-actions">
                        <button disabled={editPending} className="pg-button">{editPending ? "…" : <Tr fr="Enregistrer" ar="سجّل" />}</button>
                        <button type="button" onClick={() => setEditId("")} className="pg-button pg-button-secondary"><Tr fr="Fermer" ar="غلق" /></button>
                      </div>
                    </form>
                  )}

                  {ticketId === c.id && (
                    <div className="mt-3">
                      <CakeTicket data={{
                        numero: c.numero, clientNom: c.clientNom, telephone: c.telephone,
                        dateEvent: c.dateEvent, nbParts: c.nbParts, prixHt: Number(c.prixHt),
                        tvaPct: Number(c.tvaPct), acompte: Number(c.acompte), statut: c.statut,
                      }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {termines.length > 0 && (
          <details className="pg-cake-more pg-cake-done">
            <summary><Tr fr="Terminés et annulés" ar="المنتهية والملغاة" /> ({termines.length})</summary>
            <ul className="pg-cake-done-list">
              {termines.map((c) => (
                <li key={c.id}>
                  <b>{c.clientNom}</b> · {dateFr(c.dateEvent)} · {da(Number(c.prixHt))}
                  <span className="pg-badge"><Statut code={c.statut} /></span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {[assignState, evolveState, editState, cgvState].map((st, i) =>
          st.erreur ? <p key={`e${i}`} role="alert" className="pg-form-error">{st.erreur}</p> : null,
        )}
        {[assignState, evolveState, editState, cgvState].map((st, i) =>
          st.succes ? <p key={`s${i}`} role="status" className="pg-form-ok">{st.succes}</p> : null,
        )}
      </section>
    </div>
  );
}
