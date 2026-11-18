import type { Metadata } from "next";
import Link from "next/link";
import PortionEstimator from "@/components/portion-estimator";
import AppearancePicker, { QuickColorMode } from "@/components/appearance";
import { canReadCosts, getSessionContext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Estimateur parts, moule & prix en DA — PâtisGest",
  description:
    "Calculez sans compte le nombre de parts d’un moule (ou le moule recommandé) et le coût complet d’un gâteau, entremets ou coffret en dinars algériens (DA).",
};

export default async function EstimationPage() {
  const ctx = await getSessionContext();

  return (
    <div className="pg-public-shell">
      <header className="pg-public-header">
        <div className="pg-public-brand">
          <Link href={ctx ? "/tableau-de-bord" : "/connexion"} className="pg-brand">
            PâtisGest
          </Link>
          <span className="pg-badge" data-tone="planned">
            Outil libre · sans compte · DA
          </span>
        </div>
        <nav className="pg-public-nav" aria-label="Accès atelier">
          <AppearancePicker compact />
          <QuickColorMode />
          {ctx ? (
            <Link href="/tableau-de-bord" className="pg-button pg-button-secondary">
              Retour à l’atelier
            </Link>
          ) : (
            <Link href="/connexion" className="pg-button">
              Connexion / Démo atelier
            </Link>
          )}
        </nav>
      </header>

      <main className="pg-public-main">
        <div className="pg-intro">
          <h1>Estimateur parts, moule &amp; prix en dinars</h1>
          <p className="pg-muted">
            Passez d’un moule à un nombre de parts (ou l’inverse), séparez les ingrédients proportionnels des frais fixes (boîte, support, main-d’œuvre, cuisson) et vérifiez votre marge HT avant d’annoncer un prix.
          </p>
        </div>
        <PortionEstimator
          sessionMode={ctx ? (ctx.mode === "pilote-local" ? "demo" : "supabase") : null}
          canReadCosts={ctx ? canReadCosts(ctx.role) : false}
        />
      </main>
    </div>
  );
}
