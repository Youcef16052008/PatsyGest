"use server";

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

export async function creerComptePatisserie(
  _prev: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const nomEtab = String(formData.get("nomEtablissement") ?? "").trim();
  const nomProp = String(formData.get("nomProprietaire") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("motdepasse") ?? "");

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

  // Si l'admin client est disponible, on provisionne directement avec essai 90 jours.
  const admin = createAdminClient();
  if (admin) {
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
      // Mode « tout gratuit » : le compte naît « payé » (aucune échéance, donc
      // aucun verrouillage). Sinon, essai daté classique.
      const comptesGratuits = modeGratuit();
      const essaiDebut = new Date();
      const essaiFin = new Date(essaiDebut.getTime() + TRIAL_DURATION_DEFAULT_DAYS * 86_400_000).toISOString();
      const { data: clientRow, error: clientErr } = await admin
        .from("clients")
        .insert({
          nom: nomEtab,
          telephone: telephone || null,
          offre: "solo",
          statut_abonnement: comptesGratuits ? "paye" : "essai",
          essai_duree_jours: TRIAL_DURATION_DEFAULT_DAYS,
          essai_debut_at: essaiDebut.toISOString(),
          essai_fin_at: essaiFin,
          ...(comptesGratuits ? { paye_at: essaiDebut.toISOString(), paye_par_master: "mode-gratuit" } : {}),
        })
        .select("id")
        .single();
      if (clientErr || !clientRow) {
        return { erreur: messageUtilisateur(clientErr, "Création de l’établissement refusée") };
      }
      const clientId = String((clientRow as { id: string }).id);
      const { data: sites } = await admin
        .from("sites")
        .insert([
          { client_id: clientId, nom: "Laboratoire", type: "laboratoire" },
          { client_id: clientId, nom: "Boutique", type: "boutique" },
        ])
        .select("id");
      const { data: utilRow, error: utilErr } = await admin
        .from("utilisateurs")
        .insert({
          auth_user_id: userId,
          client_id: clientId,
          email,
          nom: nomProp,
          role: "proprietaire",
          telephone: telephone || null,
          last_seen_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (utilErr || !utilRow) {
        return { erreur: messageUtilisateur(utilErr, "Association du propriétaire refusée") };
      }
      const utilId = String((utilRow as { id: string }).id);
      if (Array.isArray(sites) && sites.length > 0) {
        await admin
          .from("equipe_sites")
          .insert(sites.map((s) => ({ utilisateur_id: utilId, site_id: (s as { id: string }).id })));
      }
      const supabase = await createClient();
      await supabase.auth.signInWithPassword({ email, password });
      redirect("/tableau-de-bord");
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err) throw err;
      return { erreur: "Erreur lors de la création du compte." };
    }
  }

  // Repli standard via signUp + RPC creer_espace_patisserie (si confirmation auto activée).
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
        ? "Numéro enregistré. La réception d’alertes dépend de la configuration et n’est pas garantie."
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
  const email = String(formData.get("email") ?? "").trim();
  const key = String(formData.get("masterKey") ?? "");
  if (!verifyMasterCredentials(email, key)) {
    return { erreur: "Identifiants Master invalides." };
  }
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
    const now = new Date();
    const essaiFin = new Date(now.getTime() + duree * 86_400_000);
    // Même règle que l'inscription libre : tant que l'abonnement n'est pas
    // ouvert, le compte est actif sans échéance.
    const comptesGratuits = modeGratuit();
    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .insert({
        nom: nomEtab,
        telephone: telephone || null,
        offre: "solo",
        statut_abonnement: comptesGratuits ? "paye" : "essai",
        essai_duree_jours: duree,
        essai_debut_at: now.toISOString(),
        essai_fin_at: essaiFin.toISOString(),
        ...(comptesGratuits ? { paye_at: now.toISOString(), paye_par_master: "mode-gratuit" } : {}),
      })
      .select("id")
      .single();
    if (clientErr || !clientRow) {
      return { erreur: messageUtilisateur(clientErr, "Création client refusée") };
    }
    const clientId = String((clientRow as { id: string }).id);
    const { data: sites } = await admin
      .from("sites")
      .insert([
        { client_id: clientId, nom: "Laboratoire", type: "laboratoire" },
        { client_id: clientId, nom: "Boutique", type: "boutique" },
      ])
      .select("id");

    const { data: utilRow, error: utilErr } = await admin
      .from("utilisateurs")
      .insert({
        auth_user_id: authRes.data.user.id,
        client_id: clientId,
        email,
        nom: nomProp,
        role: "proprietaire",
        telephone: telephone || null,
      })
      .select("id")
      .single();
    if (utilErr || !utilRow) {
      return { erreur: messageUtilisateur(utilErr, "Création utilisateur DB refusée") };
    }
    const utilId = String((utilRow as { id: string }).id);
    if (Array.isArray(sites) && sites.length > 0) {
      await admin
        .from("equipe_sites")
        .insert(sites.map((s) => ({ utilisateur_id: utilId, site_id: (s as { id: string }).id })));
    }
    revalidatePath("/master");
    return {
      ok: true,
      succes: `Compte « ${nomEtab} » créé avec ${duree} jours d’essai (jusqu’au ${essaiFin.toLocaleDateString("fr-FR")}).`,
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

  const { data: current, error: readErr } = await admin
    .from("clients")
    .select("essai_debut_at, license_version")
    .eq("id", clientId)
    .single();
  if (readErr || !current) return { erreur: "Client introuvable." };

  const row = current as { essai_debut_at: string; license_version: number };
  const debutMs = Date.parse(row.essai_debut_at) || Date.now();
  const finIso = new Date(debutMs + duree * 86_400_000).toISOString();

  const { error: updErr } = await admin
    .from("clients")
    .update({
      essai_duree_jours: duree,
      essai_fin_at: finIso,
      license_version: (row.license_version ?? 1) + 1,
    })
    .eq("id", clientId);
  if (updErr) return { erreur: messageUtilisateur(updErr, "Mise à jour de la durée impossible") };

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

  const { data: current } = await admin
    .from("clients")
    .select("license_version")
    .eq("id", clientId)
    .single();
  const nextVer = ((current as { license_version?: number } | null)?.license_version ?? 1) + 1;

  const { error } = await admin
    .from("clients")
    .update({
      statut_abonnement: "paye",
      paye_at: new Date().toISOString(),
      paye_par_master: master.email,
      license_version: nextVer,
    })
    .eq("id", clientId);
  if (error) return { erreur: messageUtilisateur(error, "Activation paiement impossible") };

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

  const { data: current } = await admin
    .from("clients")
    .select("license_version")
    .eq("id", clientId)
    .single();
  const nextVer = ((current as { license_version?: number } | null)?.license_version ?? 1) + 1;

  const { error } = await admin
    .from("clients")
    .update({
      statut_abonnement: statut,
      license_version: nextVer,
    })
    .eq("id", clientId);
  if (error) return { erreur: messageUtilisateur(error, "Modification de statut impossible") };

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
