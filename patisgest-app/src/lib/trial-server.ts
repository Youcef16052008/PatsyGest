import { createClient } from "./supabase/server";
import {
  clampTrialDays,
  signTrialLicense,
  type SubscriptionStatus,
  type TrialLicensePayload,
} from "./trial-crypto";

export interface ClientTrialStatus {
  clientId: string;
  clientNom: string;
  statutAbonnement: SubscriptionStatus;
  essaiDureeJours: number;
  essaiDebutAt: string;
  essaiFinAt: string;
  payeAt: string | null;
  licenseVersion: number;
  serverNow: string;
  verrouille: boolean;
  joursRestants: number;
  utilisateurTelephone: string | null;
  signedBundle: {
    token: string;
    publicJwk: Record<string, unknown>;
    payload: TrialLicensePayload;
  };
}

export async function lireStatutEssaiServeur(): Promise<ClientTrialStatus | null> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("lire_statut_essai_client");
    if (error || !data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    const clientId = String(row.client_id ?? "");
    const clientNom = String(row.client_nom ?? "Votre établissement");
    const statutRaw = String(row.statut_abonnement ?? "essai");
    const statutAbonnement: SubscriptionStatus =
      statutRaw === "paye" || statutRaw === "suspendu" ? statutRaw : "essai";
    const essaiDureeJours = clampTrialDays(row.essai_duree_jours);
    const essaiDebutAt = String(row.essai_debut_at ?? new Date().toISOString());
    const essaiFinAt = String(row.essai_fin_at ?? new Date(Date.now() + essaiDureeJours * 86_400_000).toISOString());
    const payeAt = row.paye_at ? String(row.paye_at) : null;
    const licenseVersion = Number(row.license_version ?? 1) || 1;
    const serverNow = String(row.server_now ?? new Date().toISOString());
    const verrouille = Boolean(row.verrouille);
    const utilisateurTelephone = row.utilisateur_telephone ? String(row.utilisateur_telephone) : null;

    const startedAtMs = Date.parse(essaiDebutAt) || Date.now();
    const expiresAtMs = Date.parse(essaiFinAt) || startedAtMs + essaiDureeJours * 86_400_000;
    const nowMs = Date.parse(serverNow) || Date.now();
    const joursRestants =
      statutAbonnement === "paye"
        ? 999
        : Math.max(0, Math.ceil((expiresAtMs - nowMs) / 86_400_000));

    const payload: TrialLicensePayload = {
      clientId,
      clientNom,
      statut: statutAbonnement,
      trialDays: essaiDureeJours,
      startedAtMs,
      expiresAtMs,
      issuedAtMs: nowMs,
      licenseVersion,
    };
    const { token, publicJwk } = signTrialLicense(payload);

    return {
      clientId,
      clientNom,
      statutAbonnement,
      essaiDureeJours,
      essaiDebutAt,
      essaiFinAt,
      payeAt,
      licenseVersion,
      serverNow,
      verrouille,
      joursRestants,
      utilisateurTelephone,
      signedBundle: {
        token,
        publicJwk: publicJwk as unknown as Record<string, unknown>,
        payload,
      },
    };
  } catch {
    return null;
  }
}
