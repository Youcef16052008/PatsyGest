"use client";

import { useTransition, type ReactNode } from "react";
import { logout } from "@/lib/actions-auth";
import { oublierDonneesLocalesDeSession } from "@/lib/deconnexion-locale";

/**
 * Bouton de déconnexion (W1-C, revue 11/01).
 *
 * Le serveur efface les cookies ; le navigateur, lui, conserve le catalogue
 * hors-ligne et l'identité du compte précédent (`patisgest.session.v1`). Sur
 * une tablette de boutique partagée, c'est la fuite la plus simple qui soit :
 * le collègue suivant ouvre `/hors-ligne` et retrouve les produits et
 * l'identité de l'ancien compte.
 *
 * On efface donc AVANT d'appeler l'action serveur ; l'effacement ne peut pas
 * échouer (voir `oublierDonneesLocalesDeSession`) et ne doit jamais empêcher
 * de se déconnecter.
 */
export default function ClientLogout({
  children,
  className,
  ariaLabel,
  title,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      title={title}
      disabled={pending}
      onClick={() => {
        oublierDonneesLocalesDeSession();
        startTransition(() => {
          // `logout()` redirige : l'action ne rend donc pas la main ici.
          void logout();
        });
      }}
    >
      {children}
    </button>
  );
}
