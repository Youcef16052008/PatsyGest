import nodemailer from "nodemailer";
import { equipeExperimentaleActive } from "./equipe-experimental.ts";

export type NotificationInvitation = "acceptee_smtp_test" | "non_configuree" | "destinataire_refuse" | "echec";

/**
 * SMTP strictement local pour essais avec destinataires fictifs. Aucun secret,
 * lien d'accès ou droit n'est envoyé. La configuration pilote est exclue :
 * une livraison réelle exige un service SMTP autorisé et une revue distincte.
 */
export async function notifierInvitationLocale(email: string, env: NodeJS.ProcessEnv = process.env): Promise<NotificationInvitation> {
  if (!equipeExperimentaleActive(env) || env.PATSYGEST_TEST_INVITATION_EMAIL !== "true") return "non_configuree";
  if (!/^[a-z0-9][a-z0-9._+-]{0,63}@(?:[a-z0-9-]+\.)*example\.test$/.test(email) || email.length > 254) return "destinataire_refuse";
  const transport = nodemailer.createTransport({
    host: "127.0.0.1", port: 54325, secure: false, ignoreTLS: true,
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: "patisgest@example.test", to: email,
      subject: "Invitation PâtisGest — essai local",
      text: "Une invitation expérimentale a été enregistrée pour cette adresse. Connectez-vous à la pile de test PâtisGest pour la consulter. Ce message ne confère aucun accès et ne contient aucun lien de connexion.",
    });
    return result.accepted.length === 1 && result.rejected.length === 0 ? "acceptee_smtp_test" : "echec";
  } catch { return "echec"; } finally { transport.close(); }
}
