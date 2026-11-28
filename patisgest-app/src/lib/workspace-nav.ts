import type { IconName } from "@/components/workspace-icons";

export type WorkspaceLink = {
  href: string;
  title: string;
  short: string;
  icon: IconName;
  description: string;
  primary?: boolean;
  advanced?: boolean;
};

export const WORKSPACE_LINKS: readonly WorkspaceLink[] = [
  { href: "/tableau-de-bord", title: "Tableau de bord", short: "Accueil", icon: "home", description: "Ventes, bénéfice, commandes et alertes", primary: true },
  { href: "/caisse", title: "Caisse rapide", short: "Caisse", icon: "receipt", description: "Encaisser vite et imprimer les tickets", primary: true },
  { href: "/cake-design", title: "Commandes & Gâteaux", short: "Gâteaux", icon: "cake", description: "Mariages, anniversaires, acomptes et retraits", primary: true },
  { href: "/recettes", title: "Mes recettes & mes prix", short: "Recettes", icon: "book", description: "Le coût de chaque recette et le prix juste", primary: true },
  { href: "/stocks", title: "Mes stocks", short: "Stocks", icon: "box", description: "Ce qui reste, ce qui manque, ce qui arrive", primary: true },
  { href: "/parametres", title: "Paramètres", short: "Réglages", icon: "settings", description: "Boutique, équipe, mode avancé et sauvegarde" },
  { href: "/production", title: "Production", short: "Production", icon: "layers", description: "Planifier et suivre les fournées", advanced: true },
  { href: "/achats", title: "Achats fournisseurs", short: "Achats", icon: "store", description: "Bons de commande et mercuriale", advanced: true },
  { href: "/planning", title: "Planning labo", short: "Planning", icon: "calendar", description: "Tâches et charge du laboratoire", advanced: true },
  { href: "/simulation", title: "Simulation stock (FEFO)", short: "Simulation", icon: "trend", description: "Fiches techniques liées aux lots", advanced: true },
  { href: "/transferts", title: "Transferts", short: "Transferts", icon: "transfer", description: "Déplacer des lots labo → boutique", advanced: true },
  { href: "/cloture", title: "Clôture & pertes", short: "Clôture", icon: "check", description: "Bilan détaillé des invendus et pertes", advanced: true },
  { href: "/qualite", title: "Qualité & HACCP", short: "Qualité", icon: "shield", description: "Relevés températures et nettoyages", advanced: true },
  { href: "/tracabilite", title: "Traçabilité", short: "Traçabilité", icon: "search", description: "Historique complet d’un lot", advanced: true },
];

/** Les réglages restent toujours accessibles, même sans mode avancé. */
export function splitWorkspaceLinks(links: readonly WorkspaceLink[], advancedMode: boolean) {
  return {
    core: links.filter((link) => link.primary && !link.advanced),
    extra: links.filter((link) => !link.primary && (!link.advanced || advancedMode)),
  };
}
