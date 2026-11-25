import { createAdminClient } from "./supabase/admin";
import {
  buildOfflineAlertMessage,
  collectDisconnectAlertRecipients,
  sendSmsAndWhatsAppAlerts,
} from "./notifications-alerte";

export interface ConnectivitySweepResult {
  ok: boolean;
  checkedAt: string;
  thresholdMinutes: number;
  disconnectedFound: number;
  alertsDispatched: number;
  error?: string;
}

export async function runOfflineDisconnectAlerts(): Promise<ConnectivitySweepResult> {
  const thresholdMin = Math.max(
    60,
    Number(process.env.PATISGEST_OFFLINE_ALERT_MINUTES ?? 60) || 60,
  );
  const checkedAt = new Date().toISOString();
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      checkedAt,
      thresholdMinutes: thresholdMin,
      disconnectedFound: 0,
      alertsDispatched: 0,
      error: "SUPABASE_SERVICE_ROLE_KEY manquant pour la surveillance de connectivité.",
    };
  }

  const cutoffIso = new Date(Date.now() - thresholdMin * 60_000).toISOString();
  const { data: users, error } = await admin
    .from("utilisateurs")
    .select("id, client_id, nom, email, role, telephone, last_seen_at, offline_alert_sent_at, offline_alert_count, clients ( id, nom )")
    .in("role", ["proprietaire", "labo", "vendeur"]);

  if (error || !users) {
    return {
      ok: false,
      checkedAt,
      thresholdMinutes: thresholdMin,
      disconnectedFound: 0,
      alertsDispatched: 0,
      error: error?.message ?? "Lecture utilisateurs impossible.",
    };
  }

  type Row = {
    id: string;
    client_id: string;
    nom: string | null;
    email: string;
    role: "proprietaire" | "labo" | "vendeur";
    telephone: string | null;
    last_seen_at: string | null;
    offline_alert_sent_at: string | null;
    offline_alert_count: number | null;
    clients: { id: string; nom: string } | null;
  };

  const rows = users as unknown as Row[];
  const byClient = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byClient.get(r.client_id) ?? [];
    arr.push(r);
    byClient.set(r.client_id, arr);
  }

  const cutoffMs = Date.parse(cutoffIso);
  let disconnectedFound = 0;
  let alertsDispatched = 0;

  for (const u of rows) {
    if (!u.last_seen_at) continue;
    const lastSeenMs = Date.parse(u.last_seen_at);
    if (!Number.isFinite(lastSeenMs) || lastSeenMs > cutoffMs) continue;

    // Éviter de renvoyer une alerte tant que l'utilisateur ne s'est pas reconnecté.
    if (u.offline_alert_sent_at) {
      const sentMs = Date.parse(u.offline_alert_sent_at);
      if (Number.isFinite(sentMs) && sentMs >= lastSeenMs) continue;
    }

    disconnectedFound += 1;
    const team = byClient.get(u.client_id) ?? [];
    const recipients = collectDisconnectAlertRecipients({
      masterPhone: process.env.PATISGEST_MASTER_PHONE,
      teamUsers: team.map((m) => ({ role: m.role, telephone: m.telephone })),
    });

    const disconnectedMinutes = Math.round((Date.now() - lastSeenMs) / 60_000);
    const clientNom = u.clients?.nom ?? "Établissement";
    const userName = u.nom || u.email;
    const message = buildOfflineAlertMessage({
      clientNom,
      role: u.role,
      userName,
      disconnectedMinutes,
    });

    const dispatch = await sendSmsAndWhatsAppAlerts({
      recipients,
      message,
      meta: {
        clientId: u.client_id,
        clientNom,
        utilisateurId: u.id,
        role: u.role,
        disconnectedMinutes,
      },
    });

    await admin.from("connectivite_alertes").insert({
      client_id: u.client_id,
      utilisateur_id: u.id,
      role: u.role,
      utilisateur_nom: userName,
      telephone_cible: recipients.join(", "),
      canaux: dispatch.canaux,
      statut: dispatch.statut,
      details: {
        disconnectedMinutes,
        recipients,
        results: dispatch.results,
      },
    });

    await admin
      .from("utilisateurs")
      .update({
        offline_alert_sent_at: checkedAt,
        offline_alert_count: (u.offline_alert_count ?? 0) + 1,
      })
      .eq("id", u.id);

    alertsDispatched += 1;
  }

  return {
    ok: true,
    checkedAt,
    thresholdMinutes: thresholdMin,
    disconnectedFound,
    alertsDispatched,
  };
}
