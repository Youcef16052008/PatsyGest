"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { runOfflineDisconnectAlerts } from "./connectivite-cron";
import {
  clearMasterSessionCookie,
  createMasterSessionCookie,
  getMasterSession,
  isMasterConfigured,
  verifyMasterCredentials,
} from "./master-auth";
import { createRateLimiter, extractClientIpFromHeaders } from "./rate-limit";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { clampTrialDays, TRIAL_DURATION_DEFAULT_DAYS } from "./trial-crypto";
import { modeGratuit } from "./licence-mode";

export type LicenceActionState = {
  ok?: boolean;
  erreur?: string;
  succes?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Limiteurs mémoire bornés (première barrière anti-abus par instance).
const signupLimiter = createRateLimiter({ maxAttempts: 3, windowMs: 60 * 60_000 });
const masterLoginLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60_000 });

async function getRequestIp(): Promise<string> {
  try {
    return extractClientIpFromHeaders(await headers());
  } catch {
    return "unknown";
  }
}

type AdminSupabase = NonNullable<ReturnType<typeof createAdminClient>>;

async function provisionTenantWithRollback(
  admin: AdminSupabase,
  params: {
    userId: string;
    nomEtab: string;
    nomProp: string;
    email: string;
    telephone: string;
    dureeEssai: number;
    comptesGratuits: boolean;
  },
): Promise<{ ok: true; essaiFin: Date } | { ok: false; erreur: string }> {
  const { userId, nomEtab, nomProp, email, telephone, dureeEssai, comptesGratuits } = params;
  const now = new Date();
  const essaiFin = new Date(now.getTime() + dureeEssai * 86_400_000);

  const rollbackAuthAndClient = async (clientId?: string) => {
    if (clientId) {
      try {
        await admin.from("clients").delete().eq("id", clientId);
      } catch {
        /* nettoyage best-effort */
      }
    }
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      /* nettoyage best-effort */
    }
  };

  // Chemin atomique (migration 58) : une seule transaction SQL pour clients + sites + utilisateurs + equipe_sites.
  const rpcRes = await admin.rpc("provisionner_espace_patisserie_admin", {
    p_auth_user_id: userId,
    p_nom_etab: nomEtab,
    p_nom_prop: nomProp,
    p_email: email,
    p_telephone: telephone || null,
    p_duree_essai: dureeEssai,
    p_mode_gratuit: comptesGratuits,
  });

  if (!rpcRes.error) {
    return { ok: true, essaiFin };
  }

  // Repli transitoire si la migration 58 n'est pas encore appliquée : écritures vérifiées + rollback complet.
  if (rpcRes.error.code !== "PGRST202" && rpcRes.error.code !== "42883") {
    await rollbackAuthAndClient();
    return { ok: false, erreur: messageUtilisateur(rpcRes.error, "Création de l’établissement refusée") };
  }

  let createdClientId: string | undefined;
  try {
    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .insert({
        nom: nomEtab,
        telephone: telephone || null,
        offre: "solo",
        statut_abonnement: comptesGratuits ? "paye" : "essai",
        essai_duree_jours: dureeEssai,
        essai_debut_at: now.toISOString(),
        essai_fin_at: essaiFin.toISOString(),
        ...(comptesGratuits ? { paye_at: now.toISOString(), paye_par_master: "mode-gratuit" } : {}),
      })
      .select("id")
      .single();
    if (clientErr || !clientRow) {
      await rollbackAuthAndClient();
      return { ok: false, erreur: messageUtilisateur(clientErr, "Création de l’établissement refusée") };
    }
    createdClientId = String((clientRow as { id: string }).id);

    const { data: sites, error: sitesErr } = await admin
      .from("sites")
      .insert([
        { client_id: createdClientId, nom: "Laboratoire", type: "laboratoire" },
        { client_id: createdClientId, nom: "Boutique", type: "boutique" },
      ])
      .select("id");
    if (sitesErr || !Array.isArray(sites) || sites.length === 0) {
      await rollbackAuthAndClient(createdClientId);
      return { ok: false, erreur: messageUtilisateur(sitesErr, "Création des sites refusée") };
    }

    const { data: utilRow, error: utilErr } = await admin
      .from("utilisateurs")
      .insert({
        auth_user_id: userId,
        client_id: createdClientId,
        email,
        nom: nomProp,
        role: "proprietaire",
        telephone: telephone || null,
        last_seen_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (utilErr || !utilRow) {
      await rollbackAuthAndClient(createdClientId);
      return { ok: false, erreur: messageUtilisateur(utilErr, "Association du propriétaire refusée") };
    }
    const utilId = String((utilRow as { id: string }).id);

    const { error: equipeErr } = await admin
      .from("equipe_sites")
      .insert(sites.map((s) => ({ utilisateur_id: utilId, site_id: (s as { id: string }).id })));
    if (equipeErr) {
      await rollbackAuthAndClient(createdClientId);
      return { ok: false, erreur: messageUtilisateur(equipeErr, "Affectation des sites refusée") };
    }

    return { ok: true, essaiFin };
  } catch {
    await rollbackAuthAndClient(createdClientId);
    return { ok: false, erreur: "Erreur lors de la création du compte." };
  }
}

export async function creerComptePatisserie(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  if (process.env.PATISGEST_SIGNUP_DISABLED === "1") {
    return {
      erreur: "La création libre de compte est désactivée sur cette instance. Contactez l’administrateur.",
    };
  }

  const nomEtab = String(formData.get("nomEtablissement") ?? "").trim();
  const nomProp = String(formData.get("nomProprietaire") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("motdepasse") ?? "");
  // Champ piège anti-bot facultatif (toujours vide pour un utilisateur humain).
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    return { erreur: "Requête refusée." };
  }

  if (nomEtab.length < 2 || nomEtab.length > 100) {
    return { erreur: "Nom de la pâtisserie requis (2 à 100 caractères)." };
  }
  if (nomProp.length < 2 || nomProp.length > 100) {
    return { erreur: "Votre nom est requis (2 à 100 caractères)." };
  }
  if (!email || !email.includes("@")) {
    return { erreur: "Adresse e-mail valide requise." };
  }
  if (password.length < 8) {
    return { erreur: "Mot de passe de 8 caractères minimum requis." };
  }

  const ip = await getRequestIp();
  const limitDecision = signupLimiter.consume(`signup:${ip}`);
  if (!limitDecision.allowed) {
    const minutes = Math.max(1, Math.ceil(limitDecision.retryAfterMs / 60_000));
    return {
      erreur: `Trop de créations de comptes depuis cette connexion. Réessayez dans ${minutes} min.`,
    };
  }

  const requireEmailConfirm = process.env.PATISGEST_REQUIRE_EMAIL_CONFIRM === "1";

  // Si l'admin client est disponible et que la confirmation e-mail n'est pas forcée,
  // provisionnement atomique avec rollback compensatoire garanti.
  const admin = createAdminClient();
  if (admin && !requireEmailConfirm) {
    try {
      const createdAuth = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nom: nomProp },
      });
      if (createdAuth.error || !createdAuth.data.user) {
        return {
          erreur: messageUtilisateur(
            createdAuth.error,
            "Impossible de créer cet utilisateur (adresse déjà utilisée ?)",
          ),
        };
      }
      const userId = createdAuth.data.user.id;
      const provisioned = await provisionTenantWithRollback(admin, {
        userId,
        nomEtab,
        nomProp,
        email,
        telephone,
        dureeEssai: TRIAL_DURATION_DEFAULT_DAYS,
        comptesGratuits: modeGratuit(),
      });
      if (!provisioned.ok) {
        return { erreur: provisioned.erreur };
      }

      const supabase = await createClient();
      await supabase.auth.signInWithPassword({ email, password });
      redirect("/tableau-de-bord");
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err) throw err;
      return { erreur: "Erreur lors de la création du compte." };
    }
  }

  // Repli standard via signUp + confirmation e-mail + RPC creer_espace_patisserie.
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nom: nomProp } },
    });
    if (error) {
      return { erreur: messageUtilisateur(error, "Inscription refusée par Supabase") };
    }
    if (!data.session) {
      return {
        ok: true,
        succes:
          modeGratuit()
            ? "Compte créé. Confirmez votre e-mail puis connectez-vous : votre espace est gratuit et sans durée limitée."
            : "Compte créé. Confirmez votre e-mail puis connectez-vous pour démarrer votre essai de 90 jours.",
      };
    }
    const { error: rpcErr } = await supabase.rpc("creer_espace_patisserie", {
      p_nom_etablissement: nomEtab,
      p_nom_proprietaire: nomProp,
      p_telephone: telephone || null,
      p_duree_essai: TRIAL_DURATION_DEFAULT_DAYS,
    });
    if (rpcErr) {
      return { erreur: messageUtilisateur(rpcErr, "Création de l’espace impossible") };
    }
    redirect("/tableau-de-bord");
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    return { erreur: "Supabase inaccessible depuis ce serveur." };
  }
}

export async function definirMonTelephone(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  const telephone = String(formData.get("telephone") ?? "").trim();
  if (telephone.length > 40) return { erreur: "Numéro trop long (40 caractères max)." };
  if (ctx.mode !== "supabase") {
    return { ok: true, succes: "Numéro enregistré localement pour la démonstration." };
  }
  try {
    const db = await createClient();
    const { error } = await db.rpc("definir_telephone_utilisateur", {
      p_telephone: telephone,
    });
    if (error) return { erreur: messageUtilisateur(error, "Enregistrement impossible") };
    revalidatePath("/parametres");
    return {
      ok: true,
      succes: telephone
        ? "Numéro enregistré pour les alertes SMS / WhatsApp de coupure Internet (> 1 h)."
        : "Numéro retiré.",
    };
  } catch {
    return { erreur: "Supabase inaccessible." };
  }
}

export async function masterLogin(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  if (!isMasterConfigured()) {
    return {
      erreur:
        "Espace Master non configuré (définissez PATISGEST_MASTER_EMAIL et PATISGEST_MASTER_KEY).",
    };
  }
  const ip = await getRequestIp();
  const limitKey = `master:${ip}`;
  const check = masterLoginLimiter.check(limitKey);
  if (!check.allowed) {
    const minutes = Math.max(1, Math.ceil(check.retryAfterMs / 60_000));
    return {
      erreur: `Trop de tentatives Master échouées. Réessayez dans ${minutes} min.`,
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const key = String(formData.get("masterKey") ?? "");
  if (!verifyMasterCredentials(email, key)) {
    masterLoginLimiter.consume(limitKey);
    return { erreur: "Identifiants Master invalides." };
  }
  masterLoginLimiter.reset(limitKey);
  await createMasterSessionCookie(email);
  revalidatePath("/master");
  return { ok: true, succes: "Session Master ouverte." };
}

export async function masterLogout(): Promise<void> {
  await clearMasterSessionCookie();
  redirect("/master");
}

export async function masterCreerCompteClient(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const master = await getMasterSession();
  if (!master) return { erreur: "Session Master requise." };

  const nomEtab = String(formData.get("nomEtablissement") ?? "").trim();
  const nomProp = String(formData.get("nomProprietaire") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("motdepasse") ?? "");
  const telephone = String(formData.get("telephone") ?? "").trim();
  const duree = clampTrialDays(formData.get("dureeEssai"));

  if (nomEtab.length < 2 || nomEtab.length > 100) return { erreur: "Nom d’établissement requis." };
  if (nomProp.length < 2 || nomProp.length > 100) return { erreur: "Nom du propriétaire requis." };
  if (!email.includes("@")) return { erreur: "E-mail valide requis." };
  if (password.length < 8) return { erreur: "Mot de passe >= 8 caractères requis." };

  const admin = createAdminClient();
  if (!admin) {
    return { erreur: "SUPABASE_SERVICE_ROLE_KEY requis pour créer des comptes depuis /master." };
  }

  try {
    const authRes = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom: nomProp },
    });
    if (authRes.error || !authRes.data.user) {
      return { erreur: messageUtilisateur(authRes.error, "Création utilisateur Auth refusée") };
    }
    const comptesGratuits = modeGratuit();
    const provisioned = await provisionTenantWithRollback(admin, {
      userId: authRes.data.user.id,
      nomEtab,
      nomProp,
      email,
      telephone,
      dureeEssai: duree,
      comptesGratuits,
    });
    if (!provisioned.ok) {
      return { erreur: provisioned.erreur };
    }

    revalidatePath("/master");
    return {
      ok: true,
      succes: comptesGratuits
        ? `Compte « ${nomEtab} » créé et activé en mode gratuit (sans échéance).`
        : `Compte « ${nomEtab} » créé avec ${duree} jours d’essai (jusqu’au ${provisioned.essaiFin.toLocaleDateString("fr-FR")}).`,
    };
  } catch {
    return { erreur: "Erreur serveur lors de la création." };
  }
}

export async function masterModifierDureeEssai(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const master = await getMasterSession();
  if (!master) return { erreur: "Session Master requise." };

  const clientId = String(formData.get("clientId") ?? "");
  if (!UUID_RE.test(clientId)) return { erreur: "Identifiant client invalide." };
  const duree = clampTrialDays(formData.get("dureeEssai"));

  const admin = createAdminClient();
  if (!admin) return { erreur: "SUPABASE_SERVICE_ROLE_KEY manquant." };

  const rpcRes = await admin.rpc("master_maj_licence_admin", {
    p_client_id: clientId,
    p_action: "duree_essai",
    p_duree_essai: duree,
  });
  if (rpcRes.error) {
    if (rpcRes.error.code !== "PGRST202" && rpcRes.error.code !== "42883") {
      return { erreur: messageUtilisateur(rpcRes.error, "Mise à jour de la durée impossible") };
    }
    // Repli optimiste si migration 58 non encore appliquée.
    const { data: current, error: readErr } = await admin
      .from("clients")
      .select("essai_debut_at, license_version")
      .eq("id", clientId)
      .single();
    if (readErr || !current) return { erreur: "Client introuvable." };

    const row = current as { essai_debut_at: string; license_version: number };
    const currentVer = row.license_version ?? 1;
    const debutMs = Date.parse(row.essai_debut_at) || Date.now();
    const finIso = new Date(debutMs + duree * 86_400_000).toISOString();

    const { data: updated, error: updErr } = await admin
      .from("clients")
      .update({
        essai_duree_jours: duree,
        essai_fin_at: finIso,
        license_version: currentVer + 1,
      })
      .eq("id", clientId)
      .eq("license_version", currentVer)
      .select("id");
    if (updErr) return { erreur: messageUtilisateur(updErr, "Mise à jour de la durée impossible") };
    if (!updated || updated.length === 0) {
      return { erreur: "Conflit de mise à jour concurrente de la licence. Réessayez." };
    }
  }

  revalidatePath("/master");
  return { ok: true, succes: `Durée d’essai mise à jour à ${duree} jours.` };
}

export async function masterMarquerPaye(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const master = await getMasterSession();
  if (!master) return { erreur: "Session Master requise." };

  const clientId = String(formData.get("clientId") ?? "");
  if (!UUID_RE.test(clientId)) return { erreur: "Identifiant client invalide." };

  const admin = createAdminClient();
  if (!admin) return { erreur: "SUPABASE_SERVICE_ROLE_KEY manquant." };

  const rpcRes = await admin.rpc("master_maj_licence_admin", {
    p_client_id: clientId,
    p_action: "marquer_paye",
    p_master_email: master.email,
  });
  if (rpcRes.error) {
    if (rpcRes.error.code !== "PGRST202" && rpcRes.error.code !== "42883") {
      return { erreur: messageUtilisateur(rpcRes.error, "Activation paiement impossible") };
    }
    const { data: current } = await admin
      .from("clients")
      .select("license_version")
      .eq("id", clientId)
      .single();
    const currentVer = (current as { license_version?: number } | null)?.license_version ?? 1;

    const { data: updated, error } = await admin
      .from("clients")
      .update({
        statut_abonnement: "paye",
        paye_at: new Date().toISOString(),
        paye_par_master: master.email,
        license_version: currentVer + 1,
      })
      .eq("id", clientId)
      .eq("license_version", currentVer)
      .select("id");
    if (error) return { erreur: messageUtilisateur(error, "Activation paiement impossible") };
    if (!updated || updated.length === 0) {
      return { erreur: "Conflit de mise à jour concurrente de la licence. Réessayez." };
    }
  }

  revalidatePath("/master");
  return {
    ok: true,
    succes: "Compte marqué comme PAYÉ. L’application reprendra dès la reconnexion Internet.",
  };
}

export async function masterChangerStatut(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const master = await getMasterSession();
  if (!master) return { erreur: "Session Master requise." };

  const clientId = String(formData.get("clientId") ?? "");
  const statut = String(formData.get("statut") ?? "");
  if (!UUID_RE.test(clientId)) return { erreur: "Identifiant client invalide." };
  if (!["essai", "paye", "suspendu"].includes(statut)) {
    return { erreur: "Statut invalide." };
  }

  const admin = createAdminClient();
  if (!admin) return { erreur: "SUPABASE_SERVICE_ROLE_KEY manquant." };

  const rpcRes = await admin.rpc("master_maj_licence_admin", {
    p_client_id: clientId,
    p_action: "changer_statut",
    p_statut: statut,
  });
  if (rpcRes.error) {
    if (rpcRes.error.code !== "PGRST202" && rpcRes.error.code !== "42883") {
      return { erreur: messageUtilisateur(rpcRes.error, "Modification de statut impossible") };
    }
    const { data: current } = await admin
      .from("clients")
      .select("license_version")
      .eq("id", clientId)
      .single();
    const currentVer = (current as { license_version?: number } | null)?.license_version ?? 1;

    const { data: updated, error } = await admin
      .from("clients")
      .update({
        statut_abonnement: statut,
        license_version: currentVer + 1,
      })
      .eq("id", clientId)
      .eq("license_version", currentVer)
      .select("id");
    if (error) return { erreur: messageUtilisateur(error, "Modification de statut impossible") };
    if (!updated || updated.length === 0) {
      return { erreur: "Conflit de mise à jour concurrente de la licence. Réessayez." };
    }
  }

  revalidatePath("/master");
  return { ok: true, succes: `Statut mis à jour : ${statut}.` };
}

export async function masterVerifierConnectivite(): Promise<LicenceActionState> {
  const master = await getMasterSession();
  if (!master) return { erreur: "Session Master requise." };

  const res = await runOfflineDisconnectAlerts();
  revalidatePath("/master");
  if (!res.ok) return { erreur: res.error ?? "Vérification impossible." };
  return {
    ok: true,
    succes: `${res.disconnectedFound} utilisateur(s) hors-ligne > ${res.thresholdMinutes} min détecté(s), ${res.alertsDispatched} alerte(s) SMS/WhatsApp envoyée(s).`,
  };
}
