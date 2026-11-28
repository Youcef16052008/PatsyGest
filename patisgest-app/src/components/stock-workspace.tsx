import "server-only";
import { canReadCosts, canWrite, type SessionContext } from "@/lib/auth";
import { articleAffiche, lireArticles, lireLots, lireSites, type WorkspaceDB } from "@/lib/workspace-read";
import { jourLocal } from "@/lib/workspace-data";
import { allergenesDerives, verifierDeclaration } from "@/lib/allergenes";
import type { LabelIngredient, LabelLot } from "@/lib/label-model";
import StockWriteForms from "./stock-write-forms";
import StockList from "./stock-list";
import LabelMaker from "./label-maker";
import ProductPhotoPicker from "./product-photo-picker";
import InvoicePhotoIntake from "./invoice-photo-intake";
import RestockRequestQuickForm from "./restock-request-quick-form";
import { Disclosure, Notice, PageIntro } from "./workspace-ui";

export default async function StockWorkspace({ ctx, db, filtre }: { ctx: SessionContext; db: WorkspaceDB; filtre?: string }) {
  const { clientId } = ctx;
  const peutEcrire = canWrite(ctx.role);
  const [articles, lots, sites, fournisseurs, recettes] = await Promise.all([
    ctx.role === "labo" ? db.from("labo_articles").select("id, nom, code, niveau, unite, seuil, allergenes, traces").eq("client_id",clientId).order("nom").limit(1000).then(r=>r.error ? null : (r.data??[]).map(a=>({...a,pv_ht:0,tva:0}))) : lireArticles(db, clientId), lireLots(db, clientId, ctx.role), lireSites(db, clientId),
    peutEcrire ? db.from("fournisseurs").select("id, nom").eq("client_id", clientId).order("nom") : null,
    peutEcrire && canReadCosts(ctx.role)
      ? db.from("recette_familles").select("id, produit_id, recette_versions!inner(id, ingredients)").eq("client_id", clientId).eq("recette_versions.active", true)
      : null,
  ]);
  const produits = (articles ?? []).filter(a => a.niveau === "produit").map(a => ({ id: a.id, code: a.code, nom: a.nom, allergenes: a.allergenes ?? [], traces: a.traces ?? [] }));
  const versions = (recettes?.data ?? []).flatMap(row => {
    const v = Array.isArray(row.recette_versions) ? row.recette_versions[0] : row.recette_versions;
    return v?.id && row.produit_id ? [{ id: String(v.id), familleId: String(row.id), produitId: String(row.produit_id), ingredients: (v.ingredients ?? []) as LabelIngredient[] }] : [];
  });
  const ingredients = Object.fromEntries(versions.map(v => [v.produitId, v.ingredients]));
  const catalogueAllergenes = (articles ?? []).flatMap(a => [a.code, a.id].map(code => ({ code, nom: a.nom, allergenes: a.allergenes ?? [] })));
  const produitParId = new Map(produits.map(p => [p.id, p]));
  const allergenes = Object.fromEntries(versions.flatMap(v => {
    const produit = produitParId.get(v.produitId);
    if (!produit) return [];
    const { derives, articlesLus } = allergenesDerives(v.id, versions as unknown as Parameters<typeof allergenesDerives>[1], catalogueAllergenes);
    return [[produit.id, verifierDeclaration(produit.allergenes, derives, articlesLus)]];
  }));
  const lotsParProduit: Record<string, LabelLot[]> = {};
  for (const l of (lots ?? []).slice().sort((a,b) => (a.dlc ?? "9999").localeCompare(b.dlc ?? "9999"))) {
    if (produitParId.has(l.articleId)) (lotsParProduit[l.articleId] ??= []).push({ numero: l.numero, dlc: l.dlc });
  }

  const today = jourLocal();
  const mappedArticles = articles?.map(articleAffiche) ?? null;

  return <>
    <PageIntro title={ctx.role === "vendeur" ? "Ce qu’il y a en boutique" : "Mes stocks"} label="Inventaire" description={ctx.role === "vendeur" ? "Regardez ce qui reste, et demandez au labo ce qui manque." : "Ce qui reste, ce qui manque, et ce qui vient d’arriver. Trois choses, rien de plus."}/>
    <div className="pg-stack">
      {peutEcrire && <div id="gerer-stocks" className="pg-stack">
        <Disclosure title="J’ai une facture du fournisseur" description="Prenez-la en photo : les lignes sont recopiées, vous vérifiez, puis ça entre en stock." icon="store">
          <InvoicePhotoIntake
            mode="supabase"
            articles={(articles ?? []).map((a) => ({ id: a.id, nom: a.nom, unite: a.unite }))}
            sites={(sites ?? []).map((s) => ({ id: s.id, label: s.label }))}
          />
        </Disclosure>
        <StockWriteForms role={ctx.role} articles={(articles ?? []).map(a => ({ id: a.id, label: `${a.nom} · ${a.code}`, unite: a.unite }))}
          sites={sites ?? []} fournisseurs={(fournisseurs?.data ?? []).map(f => ({ id: f.id, label: f.nom }))}/>
        {produits.length > 0 && (
          <Disclosure title="Photos des gâteaux" description="Une photo par gâteau : elle s’affiche sur la caisse tactile." icon="cake">
            <ProductPhotoPicker
              mode="supabase"
              scopeKey={clientId}
              products={(articles ?? []).filter((a) => a.niveau === "produit").map((a) => ({ id: a.id, nom: a.nom }))}
            />
          </Disclosure>
        )}
        {produits.length > 0 && ctx.role !== "labo" && <Disclosure title="Étiquettes des produits" description="Ingrédients, allergènes, numéro de lot et date." icon="print">
          {recettes?.error || !lots ? <Notice kind="warning">Les recettes ou les lots n’ont pas pu être chargés. Vérifiez la connexion avant de préparer des étiquettes.</Notice> :
            <LabelMaker produits={produits} recipes={ingredients} lots={lotsParProduit} allergenes={allergenes}/>}
        </Disclosure>}
        {ctx.role === "labo" && <Notice kind="warning">Les étiquettes avec ingrédients ne sont pas encore disponibles en vue laboratoire.</Notice>}
      </div>}
      {ctx.role === "labo" && !articles
        ? <Notice kind="error">Le stock n&apos;est pas disponible sur cette installation : le module de confidentialité par rôle n&apos;a pas été appliqué en base. Le propriétaire peut lire les articles et les lots normalement.</Notice>
        : <StockList key={filtre ?? "tous"} articles={mappedArticles} lots={lots} sites={sites} today={today} filtre={filtre}/>}
      {ctx.role === "vendeur" && (
        <RestockRequestQuickForm
          mode="supabase"
          articles={produits.map((p) => ({ id: p.id, label: `${p.nom} · ${p.code}` }))}
          sites={(sites ?? []).filter((s) => s.type === "boutique").map((s) => ({ id: s.id, label: s.label }))}
        />
      )}
    </div>
  </>;
}
