import type { Role } from "./permissions";

export const PILOT_ACCOUNTS: Record<
  string,
  {
    authUserId: string;
    utilisateurId: string;
    email: string;
    nom: string;
    role: Role;
    clientId: string;
    clientNom: string;
  }
> = {
  "amina@patisserie.dz": {
    authUserId: "33333333-3333-4333-8333-333333333301",
    utilisateurId: "44444444-3333-4333-8333-333333333301",
    email: "amina@patisserie.dz",
    nom: "Aïcha (Propriétaire)",
    role: "proprietaire",
    clientId: "11111111-1111-4111-8111-111111111111",
    clientNom: "Maison Amande",
  },
  "sara@patisserie.dz": {
    authUserId: "33333333-3333-4333-8333-333333333302",
    utilisateurId: "44444444-3333-4333-8333-333333333302",
    email: "sara@patisserie.dz",
    nom: "Sara (Responsable Labo)",
    role: "labo",
    clientId: "11111111-1111-4111-8111-111111111111",
    clientNom: "Maison Amande",
  },
  "amine@patisserie.dz": {
    authUserId: "33333333-3333-4333-8333-333333333303",
    utilisateurId: "44444444-3333-4333-8333-333333333303",
    email: "amine@patisserie.dz",
    nom: "Amine (Vendeur Caisse)",
    role: "vendeur",
    clientId: "11111111-1111-4111-8111-111111111111",
    clientNom: "Maison Amande",
  },
};
