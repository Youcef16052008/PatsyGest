import { redirect } from "next/navigation";
import { getSessionContextDetaille } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { ctx, raison } = await getSessionContextDetaille();
  // Essai verrouillé : surtout PAS `/connexion`. La connexion redirige vers
  // `/tableau-de-bord`, dont le layout n'accepte que les sessions autorisées…
  // `/tableau-de-bord` est le bon aiguillage : son layout est le seul point
  // autorisé à rendre l'écran de verrouillage pour une session verrouillée.
  if (raison === "essai-verrouille") redirect("/tableau-de-bord");
  redirect(ctx ? "/tableau-de-bord" : "/connexion");
}
