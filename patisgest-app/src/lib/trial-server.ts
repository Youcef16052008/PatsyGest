import { cache } from "react";
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

/*
 * Déduplication par requête HTTP.
 *
 * Le layout a besoin du statut complet (jeton signé pour le client) et la
 * garde de session n'a besoin que de `verrouille` : les deux doivent partager
 * UN SEUL appel RPC par requête, sinon chaque page en déclencherait deux ou
 * trois.
 *
 * Deux mécanismes complémentaires :
 *  • `cache()` de React — vrai périmètre « requête » sous Next (RSC, actions,
 *    routes). Hors rendu React, la fonction s'exécute simplement sans cache :
 *    jamais d'erreur, seulement moins d'économies.
 *  • déduplication en vol — deux appels simultanés dans le même tick
 *    partagent la même promesse, cache React ou pas (utile en test et dans
 *    les cas hors rendu).
 *
 * Sur l'échec : une lecture ratée produit `null`, donc « non verrouillé ».
 * Au sein d'une même requête c'est cohérent (la garde et le layout voient la
 * même réponse) ; la requête suivante refait une lecture fraîche.
 */
let statutEnVol: Promise<ClientTrialStatus | null> | null = null;

function lireStatutEssaiMemoise(): Promise<ClientTrialStatus | null> {
  if (!statutEnVol) {
    statutEnVol = lireStatutEssaiServeur().finally(() => { statutEnVol = null; });
  }
  return statutEnVol;
}

/** Statut d'essai partagé pour la requête courante (un seul RPC). */
export const lireStatutEssaiPartage: () => Promise<ClientTrialStatus | null> =
  cache(lireStatutEssaiMemoise);

/** Réinitialise la déduplication en vol (tests uniquement). */
export function reinitialiserStatutEssaiPartage(): void {
  statutEnVol = null;
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
