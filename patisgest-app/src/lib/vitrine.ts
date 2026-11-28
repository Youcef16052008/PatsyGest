/**
 * Vitrine côté application — chargement du catalogue public et actions du
 * personnel. Séparé de `actions-*.ts` volontairement : la lecture publique
 * ne doit jamais passer par une session, et l'écriture ne doit jamais
 * passer par la RPC anonyme.
 *
 * ⚠️ Un visiteur anonyme lit `vitrine_catalogue` (migration 26), une vue
 * qui ne contient AUCUNE colonne de coût. On ne lit jamais
 * `recette_familles` ni `articles` pour construire une page publique.
 */

import { createClient as createServerSupabase } from "./supabase/server";
import type { Role } from "./permissions";
import { peutVitrine, type ActionVitrine } from "./vitrine-permissions";

export type ArticleVitrine = {
  cleNom: string;
  nom: string;
  description: string | null;
  photo: string | null;
  /** `null` = prix non communiqué (« sur demande »), jamais 0 DA. */
  prixHt: number | null;
  tva: number | null;
  unite: string | null;
};

export type VitrinePublique = {
  etablissement: string;
  boutique: string;
  sousDomaine: string;
  articles: ArticleVitrine[];
  /** Message lisible quand la vitrine n'existe pas ou n'est pas publiée. */
  indisponible?: string;
};

export type LigneVitrine = {
  cle_nom: string;
  nom: string;
  description: string | null;
  photo_vitrine: string | null;
  ordre_vitrine: number;
  etablissement: string;
  boutique: string;
  subdomain: string;
  prix_ht: number | null;
  tva: number | null;
  unite: string | null;
};

/**
 * Catalogue d'une vitrine, par sous-domaine. Aucune donnée personnelle :
 * uniquement ce qu'un visiteur doit voir.
 */
export async function lireVitrinePublique(sousDomaine: string): Promise<VitrinePublique> {
  const vide: VitrinePublique = {
    etablissement: "",
    boutique: "",
    sousDomaine,
    articles: [],
  };

  const domaine = sousDomaine.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(domaine)) {
    return { ...vide, indisponible: "Adresse de boutique invalide." };
  }

  // Sans configuration Supabase (poste de dev, environnement de test), on
  // renvoie l'état « indisponible » : une vitrine ne doit jamais produire
  // une erreur 500 devant un visiteur.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { ...vide, indisponible: "La vitrine est momentanément indisponible." };
  }

  let supabase;
  try {
    supabase = await createServerSupabase();
  } catch {
    return { ...vide, indisponible: "La vitrine est momentanément indisponible." };
  }

  const { data, error } = await supabase
    .from("vitrine_catalogue")
    .select("cle_nom, nom, description, photo_vitrine, ordre_vitrine, etablissement, boutique, subdomain, prix_ht, tva, unite")
    .eq("subdomain", domaine)
    .order("ordre_vitrine", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    // Le visiteur reçoit un message neutre, mais l'exploitant doit pouvoir
    // savoir POURQUOI : une vue cassée ou une policy retirée produirait
    // sinon une vitrine « vide » indistinguable d'une boutique non publiée.
    console.error(
      `[vitrine] lecture impossible pour « ${domaine} » : ${error.code ?? "sans-code"} ${error.message ?? ""}`.trim(),
    );
    return { ...vide, indisponible: "La vitrine est momentanément indisponible." };
  }

  return construireVitrine(domaine, (data ?? []) as unknown as LigneVitrine[]);
}

/**
 * Transformation pure « lignes de la vue → vitrine affichable ».
 *
 * Extraite pour être testable sans base ni requête HTTP : c'est ici que se
 * joue la règle « un prix à 0 ne s'affiche jamais 0 DA ».
 */
/**
 * H16-05 — une ligne PostgREST malformée ne doit jamais devenir `undefined`
 * dans le HTML public. La vue est censée être propre, mais un cast TypeScript
 * n'est pas une validation runtime : on filtre explicitement.
 */
export function ligneVitrineValide(ligne: unknown): ligne is LigneVitrine {
  if (!ligne || typeof ligne !== "object") return false;
  const l = ligne as Record<string, unknown>;
  const texte = (cle: string) => typeof l[cle] === "string" && (l[cle] as string).trim().length > 0;
  const nombreOuNull = (cle: string) =>
    l[cle] === null || (typeof l[cle] === "number" && Number.isFinite(l[cle] as number));
  const texteOuNull = (cle: string) => l[cle] === null || typeof l[cle] === "string";
  return texte("cle_nom") && texte("nom") && texte("etablissement") && texte("boutique") && texte("subdomain")
    && nombreOuNull("prix_ht") && nombreOuNull("tva")
    && texteOuNull("description") && texteOuNull("photo_vitrine") && texteOuNull("unite");
}

export function construireVitrine(domaine: string, lignes: LigneVitrine[]): VitrinePublique {
  const vide: VitrinePublique = {
    etablissement: "",
    boutique: "",
    sousDomaine: domaine,
    articles: [],
  };

  const valides = lignes.filter(ligneVitrineValide);
  if (valides.length === 0) {
    return { ...vide, indisponible: "Cette boutique n'a pas encore publié sa vitrine." };
  }

  return {
    etablissement: valides[0].etablissement,
    boutique: valides[0].boutique,
    sousDomaine: valides[0].subdomain,
    articles: valides.map((l) => ({
      cleNom: l.cle_nom,
      nom: l.nom,
      description: l.description,
      photo: l.photo_vitrine,
      // `null` : la page écrira « prix sur demande ».
      prixHt: l.prix_ht === null ? null : Number(l.prix_ht),
      tva: l.tva === null ? null : Number(l.tva),
      unite: l.unite,
    })),
  };
}

/**
 * Garde d'action côté serveur. Une action refusée ici l'est aussi en base
 * (RLS + RPC), mais on évite au vendeur un aller-retour réseau pour lire
 * « forbidden ».
 */
export function exigerAction(role: Role, action: ActionVitrine): string | null {
  return peutVitrine(role, action)
    ? null
    : "Votre rôle ne permet pas cette action sur la vitrine.";
}

// Le formatage vit dans un module pur (`vitrine-format.ts`) pour que les
// composants clients puissent l'utiliser sans importer le client serveur.
export { libellePrix } from "./vitrine-format";
export type { ArticlePrix } from "./vitrine-format";
