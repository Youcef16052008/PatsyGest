import MasterPortal, {
  MasterLoginCard,
  type MasterAlertRow,
  type MasterClientRow,
} from "@/components/master-portal";
import { getMasterSession, isMasterConfigured } from "@/lib/master-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clampTrialDays } from "@/lib/trial-crypto";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Espace Master — PâtisGest",
  robots: { index: false, follow: false },
};

async function chargerDonneesMaster() {
  const nowMs = Date.now();
  const admin = createAdminClient();
  let clients: MasterClientRow[] = [];
  let alerts: MasterAlertRow[] = [];

  if (admin) {
    const [{ data: clientsData }, { data: usersData }, { data: alertsData }] = await Promise.all([
      admin
        .from("clients")
        .select(
          "id, nom, telephone, statut_abonnement, essai_duree_jours, essai_debut_at, essai_fin_at, paye_at, paye_par_master, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("utilisateurs")
        .select(
          "id, client_id, nom, email, role, telephone, last_seen_at, offline_alert_sent_at, offline_alert_count",
        )
        .limit(1000),
      admin
        .from("connectivite_alertes")
        .select("id, client_id, role, utilisateur_nom, telephone_cible, statut, canaux, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const usersByClient = new Map<string, MasterClientRow["users"]>();
    for (const u of (usersData ?? []) as {
      id: string;
      client_id: string;
      nom: string | null;
      email: string;
      role: "proprietaire" | "labo" | "vendeur";
      telephone: string | null;
      last_seen_at: string | null;
      offline_alert_sent_at: string | null;
      offline_alert_count: number | null;
    }[]) {
      const list = usersByClient.get(u.client_id) ?? [];
      list.push({
        id: u.id,
        nom: u.nom,
        email: u.email,
        role: u.role,
        telephone: u.telephone,
        lastSeenAt: u.last_seen_at,
        offlineAlertSentAt: u.offline_alert_sent_at,
        offlineAlertCount: u.offline_alert_count ?? 0,
      });
      usersByClient.set(u.client_id, list);
    }

    const clientNameMap = new Map<string, string>();
    clients = ((clientsData ?? []) as {
      id: string;
      nom: string;
      telephone: string | null;
      statut_abonnement: "essai" | "paye" | "suspendu";
      essai_duree_jours: number;
      essai_debut_at: string;
      essai_fin_at: string;
      paye_at: string | null;
      paye_par_master: string | null;
      created_at: string;
    }[]).map((c) => {
      clientNameMap.set(c.id, c.nom);
      return {
        id: c.id,
        nom: c.nom,
        telephone: c.telephone,
        statutAbonnement: c.statut_abonnement ?? "essai",
        essaiDureeJours: clampTrialDays(c.essai_duree_jours),
        essaiDebutAt: c.essai_debut_at,
        essaiFinAt: c.essai_fin_at,
        payeAt: c.paye_at,
        payeParMaster: c.paye_par_master,
        createdAt: c.created_at,
        users: usersByClient.get(c.id) ?? [],
      };
    });

    alerts = ((alertsData ?? []) as {
      id: string;
      client_id: string;
      role: string;
      utilisateur_nom: string | null;
      telephone_cible: string | null;
      statut: string;
      canaux: string[] | null;
      created_at: string;
    }[]).map((a) => ({
      id: a.id,
      clientNom: clientNameMap.get(a.client_id) ?? "Établissement",
      role: a.role,
      utilisateurNom: a.utilisateur_nom,
      telephoneCible: a.telephone_cible,
      statut: a.statut,
      canaux: Array.isArray(a.canaux) ? a.canaux : [],
      createdAt: a.created_at,
    }));
  }

  return { nowMs, hasAdminKey: Boolean(admin), clients, alerts };
}

export default async function MasterPage() {
  const configured = isMasterConfigured();
  const session = await getMasterSession();

  if (!configured || !session) {
    return <MasterLoginCard configured={configured} />;
  }

  const { nowMs, hasAdminKey, clients, alerts } = await chargerDonneesMaster();

  return (
    <MasterPortal
      masterEmail={session.email}
      masterPhone={process.env.PATISGEST_MASTER_PHONE ?? null}
      hasAdminKey={hasAdminKey}
      nowMs={nowMs}
      clients={clients}
      alerts={alerts}
    />
  );
}
