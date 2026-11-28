import { createAdminClient } from "./supabase/admin";
import {
  buildOfflineAlertMessage,
  collectDisconnectAlertRecipients,
  sendSmsAndWhatsAppAlerts,
} from "./notifications-alerte";

/** Ligne `utilisateurs` telle que la consomme le balayage de connectivité. */
export type LigneUtilisateur = {
  id: string;
  client_id: string;
  nom: string | null;
  email: string;
  role: "proprietaire" | "labo" | "vendeur";
  telephone: string | null;
  last_seen_at: string | null;
  offline_alert_sent_at: string | null;
  offline_alert_count: number | null;
  /* PostgREST rend un objet OU un tableau pour une jointure 1-1. */
  clients: { id: string; nom: string } | { id: string; nom: string }[] | null;
};

const ROLES_CONNUS = ["proprietaire", "labo", "vendeur"] as const;

/**
 * Garde de type étroite sur une ligne PostgREST.
 *
 * Remplace le `as unknown as Row[]` d'origine, qui affirmait une forme que rien
 * ne vérifiait : une ligne nulle — ou privée de `client_id` — faisait lever
 * « Cannot read properties of null » et annulait TOUT le balayage, y compris
 * pour les comptes sains. On ne garde que les champs réellement exploités.
 */
export function estLigneUtilisateur(brut: unknown): brut is LigneUtilisateur {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return false;
  const r = brut as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return false;
  if (typeof r.client_id !== "string" || !r.client_id) return false;
  if (typeof r.email !== "string") return false;
  if (!ROLES_CONNUS.includes(r.role as (typeof ROLES_CONNUS)[number])) return false;
  for (const cle of ["nom", "telephone", "last_seen_at", "offline_alert_sent_at"]) {
    if (r[cle] !== null && r[cle] !== undefined && typeof r[cle] !== "string") return false;
  }
  if (r.offline_alert_count !== null && r.offline_alert_count !== undefined
      && typeof r.offline_alert_count !== "number") return false;
  return true;
}

export interface ConnectivitySweepResult {
  ok: boolean;
  checkedAt: string;
  thresholdMinutes: number;
  disconnectedFound: number;
  alertsDispatched: number;
  alertsFailed: number;
  error?: string;
}

/**
 * Une seule horloge de référence pour le balayage : `checkedAt` sert à la fois
 * au filtre DB et au calcul des minutes. Une seconde lecture de l'horloge
 * système pouvait produire une borne différente de `cutoffIso` si le temps avançait pendant le
 * balayage ou si l'horloge serveur dérivait.
 */
export function borneConnectivite(checkedAt: string, thresholdMin: number) {
  const checkedAtMs = Date.parse(checkedAt);
  const cutoffMs = checkedAtMs - thresholdMin * 60_000;
  return { checkedAtMs, cutoffMs, cutoffIso: new Date(cutoffMs).toISOString() };
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
      alertsFailed: 0,
      error: "SUPABASE_SERVICE_ROLE_KEY manquant pour la surveillance de connectivité.",
    };
  }

  const { checkedAtMs, cutoffMs, cutoffIso } = borneConnectivite(checkedAt, thresholdMin);
  const { data: users, error } = await admin
    .from("utilisateurs")
    .select("id, client_id, nom, email, role, telephone, last_seen_at, offline_alert_sent_at, offline_alert_count, clients ( id, nom )")
    .in("role", ["proprietaire", "labo", "vendeur"])
    .lt("last_seen_at", cutoffIso);

  if (error || !users) {
    return {
      ok: false,
      checkedAt,
      thresholdMinutes: thresholdMin,
      disconnectedFound: 0,
      alertsDispatched: 0,
      alertsFailed: 0,
      error: error?.message ?? "Lecture utilisateurs impossible.",
    };
  }

  /*
   * La réponse vient de PostgREST : on la filtre par garde de type au lieu de
   * la caster. Une ligne inexploitable est ignorée et comptée ; le balayage
   * continue pour les comptes sains.
   */
  const rows: LigneUtilisateur[] = [];
  let lignesIgnorees = 0;
  for (const brut of Array.isArray(users) ? users : []) {
    if (!estLigneUtilisateur(brut)) {
      lignesIgnorees += 1;
      continue;
    }
    rows.push(brut);
  }
  if (rows.length === 0 && lignesIgnorees > 0) {
    return {
      ok: false,
      checkedAt,
      thresholdMinutes: thresholdMin,
      disconnectedFound: 0,
      alertsDispatched: 0,
      alertsFailed: 0,
      error: `Aucune ligne utilisateur exploitable (${lignesIgnorees} ignorée(s)).`,
    };
  }
  const byClient = new Map<string, LigneUtilisateur[]>();
  for (const r of rows) {
    const arr = byClient.get(r.client_id) ?? [];
    arr.push(r);
    byClient.set(r.client_id, arr);
  }

  let disconnectedFound = 0;
  let alertsDispatched = 0;
  let alertsFailed = 0;

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

    const disconnectedMinutes = Math.round((checkedAtMs - lastSeenMs) / 60_000);
    // PostgREST rend la jointure en objet OU en tableau. `u.clients?.nom`
    // ne couvrait que l'objet : en forme tableau, TOUTES les alertes
    // affichaient « Établissement » au lieu du vrai nom (mesuré).
    const jointure = Array.isArray(u.clients) ? u.clients[0] : u.clients;
    const clientNom = jointure?.nom ?? "Établissement";
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

    // « Simulation », « partiel » et « echec » ne sont PAS une livraison :
    // marquer `offline_alert_sent_at` supprimerait la prochaine tentative et
    // ferait croire au Master qu'une alerte est partie.
    const livree = dispatch.statut === "envoye"
      && dispatch.results.length > 0
      && dispatch.results.every((r) => r.ok);
    if (!livree) {
      alertsFailed += 1;
      continue;
    }

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
    ok: alertsFailed === 0,
    checkedAt,
    thresholdMinutes: thresholdMin,
    disconnectedFound,
    alertsDispatched,
    alertsFailed,
    ...(alertsFailed > 0
      ? { error: `${alertsFailed} alerte(s) non livrée(s) : aucune confirmation d'envoi n'a été obtenue.` }
      : {}),
  };
}
