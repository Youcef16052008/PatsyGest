import type { IconName } from "@/components/workspace-icons";

export type WorkspaceLink = { href: string; title: string; short: string; icon: IconName; description: string; primary?: boolean };
export const WORKSPACE_LINKS: readonly WorkspaceLink[] = [
  { href: "/tableau-de-bord", title: "Vue d’ensemble", short: "Accueil", icon: "home", description: "Vos priorités du jour", primary: true },
  { href: "/stocks", title: "Stocks", short: "Stocks", icon: "box", description: "Articles, quantités et lots", primary: true },
  { href: "/recettes", title: "Recettes", short: "Recettes", icon: "book", description: "Ingrédients, rendements et coûts", primary: true },
  { href: "/production", title: "Production", short: "Production", icon: "layers", description: "Planifier et suivre les fournées", primary: true },
  { href: "/caisse", title: "Caisse", short: "Caisse", icon: "receipt", description: "Encaisser et retrouver les ventes", primary: true },
  { href: "/cake-design", title: "Cake Design", short: "Gâteaux", icon: "cake", description: "Devis et gâteaux sur commande" },
  { href: "/achats", title: "Achats", short: "Achats", icon: "store", description: "Commandes et fournisseurs" },
  { href: "/planning", title: "Planning", short: "Planning", icon: "calendar", description: "Tâches et charge de production" },
  { href: "/simulation", title: "Simulation prix", short: "Simulation", icon: "trend", description: "Comparer les prix et les marges" },
  { href: "/transferts", title: "Transferts", short: "Transferts", icon: "transfer", description: "Déplacer des lots d’un site à l’autre" },
  { href: "/cloture", title: "Clôture & pertes", short: "Clôture", icon: "check", description: "Faire le bilan des ventes et des pertes" },
  { href: "/qualite", title: "Qualité", short: "Qualité", icon: "shield", description: "Relevés et contrôles HACCP" },
  { href: "/tracabilite", title: "Traçabilité", short: "Traçabilité", icon: "search", description: "Retrouver les mouvements d’un lot" },
  { href: "/parametres", title: "Paramètres", short: "Paramètres", icon: "settings", description: "Apparence, identité et sauvegardes" },
];
