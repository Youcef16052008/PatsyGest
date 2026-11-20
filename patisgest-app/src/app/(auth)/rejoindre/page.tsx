import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";
import { equipeExperimentaleActive } from "@/lib/equipe-experimental";
import { createClient } from "@/lib/supabase/server";
import RejoindreEquipe from "@/components/rejoindre-equipe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rejoindre un établissement — PâtisGest" };

export default async function RejoindrePage() {
  if (!equipeExperimentaleActive()) notFound();
  if (await getSessionContext()) redirect("/tableau-de-bord");
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email) redirect("/connexion");
  const verified = !!data.user.email_confirmed_at;
  let demandes: { id:string; etablissement:string; role_demande:string; statut:string }[] = [];
  let invitations: { id:string; etablissement:string; role:string; expire_le:string }[] = [];
  let unavailable = !verified;
  if (verified) {
    try {
      const [d, i] = await Promise.all([db.rpc("equipe_mes_demandes"), db.rpc("equipe_mes_invitations")]);
      unavailable = !!d.error || !!i.error || !Array.isArray(d.data) || !Array.isArray(i.data) || (d.data?.length ?? 0)>500 || (i.data?.length ?? 0)>500;
      if (!unavailable) { demandes = d.data; invitations = i.data; }
    } catch { unavailable = true; }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-2xl font-bold">Rejoindre un établissement · expérimental</h1>
    <p>Connecté : {data.user.email}. Parcours réservé à une pile locale jetable ; aucun e-mail réel n’est envoyé par cette interface.</p>
    <p role="alert">L’admission reste verrouillée jusqu’à validation complète. Une demande ou une invitation ne donne pas accès automatiquement.</p>
    {unavailable ? <p role="alert">Adresse vérifiée ou données d’équipe indisponibles. Contactez le propriétaire ; aucune action n’est proposée.</p> : <RejoindreEquipe demandes={demandes} invitations={invitations}/>}
    <form action={logout}><button className="pg-button pg-button-secondary">Se déconnecter</button></form>
  </main>;
}
