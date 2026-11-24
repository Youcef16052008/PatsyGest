import Link from "next/link";
import CoquilleHorsLigne from "@/components/coquille-hors-ligne";

/**
 * NF-02 / D5 — coquille hors-ligne.
 *
 * **Pourquoi cette page existe.** Le service worker refuse de mettre en cache
 * du HTML authentifié, et il a raison : sur une tablette partagée, le HTML d'un
 * compte resterait lisible après changement de compte. Conséquence impossible à
 * contourner sans cette page : sans réseau, on ne pouvait **pas rouvrir**
 * l'application, donc pas encaisser, même si la file de tickets et le catalogue
 * étaient déjà sur l'appareil.
 *
 * **Ce que cette page est.** Une page *publique*, mise en cache comme un asset
 * ordinaire : son HTML ne contient aucune donnée client (ni nom, ni produit, ni
 * montant) et ne dépend d'aucune requête serveur. Tout ce qui est personnalisé
 * est lu côté navigateur, après vérification que le catalogue appartient au
 * compte actuellement connecté sur cet appareil.
 *
 * **Ce qu'elle n'est pas.** Pas un contournement de connexion : sans identité
 * locale correspondante, elle n'affiche aucun client. Pas une caisse complète
 * non plus : elle sert à ne pas perdre la journée quand le réseau tombe, puis à
 * revenir à la caisse normale dès qu'il revient.
 */
export const metadata = {
  title: "Hors-ligne — PâtisGest",
  robots: { index: false, follow: false },
};

export default function PageHorsLigne() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-5 py-10">
      <CoquilleHorsLigne />

      <p className="text-center text-xs text-slate-500">
        <Link href="/caisse" className="font-semibold text-violet-800 underline">
          Revenir à la caisse
        </Link>
        {" · "}
        <Link href="/" className="underline">
          Accueil
        </Link>
      </p>
    </main>
  );
}
