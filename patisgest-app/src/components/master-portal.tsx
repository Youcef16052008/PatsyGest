"use client";

import { useActionState } from "react";
import {
  masterChangerStatut,
  masterCreerCompteClient,
  masterLogin,
  masterLogout,
  masterMarquerPaye,
  masterModifierDureeEssai,
  masterVerifierConnectivite,
  type LicenceActionState,
} from "@/lib/actions-licence";

export interface MasterClientRow {
  id: string;
  nom: string;
  telephone: string | null;
  statutAbonnement: "essai" | "paye" | "suspendu";
  essaiDureeJours: number;
  essaiDebutAt: string;
  essaiFinAt: string;
  payeAt: string | null;
  payeParMaster: string | null;
  createdAt: string;
  users: {
    id: string;
    nom: string | null;
    email: string;
    role: "proprietaire" | "labo" | "vendeur";
    telephone: string | null;
    lastSeenAt: string | null;
    offlineAlertSentAt: string | null;
    offlineAlertCount: number;
  }[];
}

export interface MasterAlertRow {
  id: string;
  clientNom: string;
  role: string;
  utilisateurNom: string | null;
  telephoneCible: string | null;
  statut: string;
  canaux: string[];
  createdAt: string;
}

export function MasterLoginCard({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(masterLogin, {} as LicenceActionState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-700">
          Administration PâtisGest
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Espace Master</h1>
        <p className="mt-1 text-sm text-slate-600">
          Gestion des essais (60 à 90 jours), validation des paiements et surveillance des coupures Internet.
        </p>
        {!configured ? (
          <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-xs text-amber-900">
            Variables requises non configurées : définissez{" "}
            <code>PATISGEST_MASTER_EMAIL</code> et <code>PATISGEST_MASTER_KEY</code> (16+ caractères)
            dans l’environnement serveur.
          </div>
        ) : (
          <form action={action} className="mt-5 space-y-3">
            <label className="pg-field">
              E-mail Master
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                className="pg-input"
              />
            </label>
            <label className="pg-field">
              Clé secrète Master
              <input
                name="masterKey"
                type="password"
                required
                autoComplete="current-password"
                className="pg-input"
              />
            </label>
            {state.erreur && (
              <p role="alert" className="text-sm text-red-700">
                {state.erreur}
              </p>
            )}
            <button type="submit" disabled={pending} className="pg-button w-full">
              {pending ? "Vérification…" : "Ouvrir l’espace Master"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function ClientActionsRow({ client, nowMs }: { client: MasterClientRow; nowMs: number }) {
  const [payState, payAction, payPending] = useActionState(masterMarquerPaye, {} as LicenceActionState);
  const [durState, durAction, durPending] = useActionState(
    masterModifierDureeEssai,
    {} as LicenceActionState,
  );
  const [statState, statAction, statPending] = useActionState(
    masterChangerStatut,
    {} as LicenceActionState,
  );

  const daysLeft = Math.ceil((Date.parse(client.essaiFinAt) - nowMs) / 86_400_000);
  const expired = client.statutAbonnement === "essai" && daysLeft <= 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-slate-900">{client.nom}</h3>
            <span
              className="pg-badge"
              data-tone={
                client.statutAbonnement === "paye"
                  ? "success"
                  : client.statutAbonnement === "suspendu" || expired
                    ? "danger"
                    : "warning"
              }
            >
              {client.statutAbonnement === "paye"
                ? "PAYÉ ✓"
                : client.statutAbonnement === "suspendu"
                  ? "SUSPENDU"
                  : expired
                    ? "ESSAI EXPIRÉ"
                    : `ESSAI · J-${daysLeft}`}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ID : <code>{client.id}</code> · Tél. établissement : {client.telephone || "non renseigné"} ·
            Durée essai : <strong>{client.essaiDureeJours} jours</strong> · Fin d’essai :{" "}
            {new Date(client.essaiFinAt).toLocaleDateString("fr-FR")}
            {client.payeAt && ` · Payé le ${new Date(client.payeAt).toLocaleDateString("fr-FR")}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {client.statutAbonnement !== "paye" && (
            <form action={payAction}>
              <input type="hidden" name="clientId" value={client.id} />
              <button type="submit" disabled={payPending} className="pg-button">
                {payPending ? "Activation…" : "Marquer comme PAYÉ ✓"}
              </button>
            </form>
          )}
          <form action={durAction} className="flex items-center gap-1.5">
            <input type="hidden" name="clientId" value={client.id} />
            <select
              name="dureeEssai"
              defaultValue={String(client.essaiDureeJours)}
              aria-label={`Durée d'essai pour ${client.nom}`}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="60">60 jours</option>
              <option value="75">75 jours</option>
              <option value="90">90 jours (défaut)</option>
            </select>
            <button
              type="submit"
              disabled={durPending}
              className="pg-button pg-button-secondary text-xs"
            >
              Appliquer durée
            </button>
          </form>
          {client.statutAbonnement !== "suspendu" ? (
            <form action={statAction}>
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="statut" value="suspendu" />
              <button
                type="submit"
                disabled={statPending}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800"
              >
                Suspendre
              </button>
            </form>
          ) : (
            <form action={statAction}>
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="statut" value="essai" />
              <button
                type="submit"
                disabled={statPending}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"
              >
                Remettre en essai
              </button>
            </form>
          )}
        </div>
      </div>

      {(payState.succes || payState.erreur || durState.succes || durState.erreur || statState.succes || statState.erreur) && (
        <p
          role="status"
          className={`mt-2 text-xs font-semibold ${
            payState.erreur || durState.erreur || statState.erreur
              ? "text-red-700"
              : "text-emerald-700"
          }`}
        >
          {payState.erreur ||
            durState.erreur ||
            statState.erreur ||
            payState.succes ||
            durState.succes ||
            statState.succes}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-1.5 pr-3">Utilisateur</th>
              <th className="py-1.5 pr-3">Rôle</th>
              <th className="py-1.5 pr-3">Téléphone alerte</th>
              <th className="py-1.5 pr-3">Dernière connexion</th>
              <th className="py-1.5">Alerte &gt; 1h</th>
            </tr>
          </thead>
          <tbody>
            {client.users.map((u) => {
              const mins = u.lastSeenAt
                ? Math.round((nowMs - Date.parse(u.lastSeenAt)) / 60_000)
                : null;
              const stale = mins !== null && mins > 60;
              return (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-medium">
                    {u.nom || u.email} <span className="text-slate-400">({u.email})</span>
                  </td>
                  <td className="py-1.5 pr-3">{u.role}</td>
                  <td className="py-1.5 pr-3">{u.telephone || "—"}</td>
                  <td className={`py-1.5 pr-3 ${stale ? "font-bold text-rose-700" : "text-slate-600"}`}>
                    {mins === null ? "Jamais vue" : mins <= 1 ? "En ligne" : `Il y a ${mins} min`}
                  </td>
                  <td className="py-1.5">
                    {u.offlineAlertSentAt
                      ? `Envoyée (${u.offlineAlertCount}×)`
                      : stale
                        ? "En attente d'envoi"
                        : "OK"}
                  </td>
                </tr>
              );
            })}
            {client.users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-slate-400">
                  Aucun utilisateur rattaché.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function MasterPortal({
  masterEmail,
  masterPhone,
  hasAdminKey,
  nowMs,
  clients,
  alerts,
}: {
  masterEmail: string;
  masterPhone: string | null;
  hasAdminKey: boolean;
  nowMs: number;
  clients: MasterClientRow[];
  alerts: MasterAlertRow[];
}) {
  const [createState, createAction, createPending] = useActionState(
    masterCreerCompteClient,
    {} as LicenceActionState,
  );
  const [sweepState, sweepAction, sweepPending] = useActionState(
    masterVerifierConnectivite,
    {} as LicenceActionState,
  );

  const essais = clients.filter((c) => c.statutAbonnement === "essai").length;
  const payes = clients.filter((c) => c.statutAbonnement === "paye").length;
  const expiresOuSuspendus = clients.filter(
    (c) =>
      c.statutAbonnement === "suspendu" ||
      (c.statutAbonnement === "essai" && Date.parse(c.essaiFinAt) <= nowMs),
  ).length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700">
            Espace Master · PâtisGest
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Licences, essais &amp; connectivité
          </h1>
          <p className="text-xs text-slate-500">
            Connecté : {masterEmail} · Tél. alertes Master :{" "}
            {masterPhone || "non défini (PATISGEST_MASTER_PHONE)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={sweepAction}>
            <button type="submit" disabled={sweepPending} className="pg-button">
              {sweepPending ? "Analyse…" : "Vérifier coupures > 1h & alerter"}
            </button>
          </form>
          <form action={masterLogout}>
            <button type="submit" className="pg-button pg-button-secondary">
              Déconnexion Master
            </button>
          </form>
        </div>
      </header>

      {!hasAdminKey && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Configuration requise :</strong> ajoutez <code>SUPABASE_SERVICE_ROLE_KEY</code> dans
          l’environnement serveur pour lister tous les comptes et activer les paiements.
        </div>
      )}

      {(sweepState.succes || sweepState.erreur) && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm font-semibold ${
            sweepState.erreur
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {sweepState.erreur || sweepState.succes}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">Total comptes</p>
          <p className="mt-1 text-2xl font-extrabold">{clients.length}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">En mode d’essai</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{essais}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">Comptes payés</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{payes}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">Expirés / Suspendus</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{expiresOuSuspendus}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Créer un nouveau compte pâtisserie (essai 60–90 jours)
        </h2>
        <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="pg-field">
            Nom de la pâtisserie
            <input name="nomEtablissement" required maxLength={100} className="pg-input" />
          </label>
          <label className="pg-field">
            Nom du propriétaire
            <input name="nomProprietaire" required maxLength={100} className="pg-input" />
          </label>
          <label className="pg-field">
            Téléphone propriétaire
            <input name="telephone" placeholder="+213 550 00 00 00" maxLength={40} className="pg-input" />
          </label>
          <label className="pg-field">
            E-mail propriétaire
            <input name="email" type="email" required className="pg-input" />
          </label>
          <label className="pg-field">
            Mot de passe initial (8+ car.)
            <input name="motdepasse" type="password" required minLength={8} className="pg-input" />
          </label>
          <label className="pg-field">
            Durée du mode d’essai
            <select name="dureeEssai" defaultValue="90" className="pg-input">
              <option value="60">60 jours (2 mois)</option>
              <option value="75">75 jours</option>
              <option value="90">90 jours (3 mois — défaut)</option>
            </select>
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={createPending} className="pg-button">
              {createPending ? "Création…" : "Créer le compte avec essai"}
            </button>
            {createState.erreur && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {createState.erreur}
              </p>
            )}
            {createState.succes && (
              <p role="status" className="mt-2 text-sm text-emerald-700">
                {createState.succes}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Comptes clients ({clients.length})</h2>
        {clients.map((c) => (
          <ClientActionsRow key={c.id} client={c} nowMs={nowMs} />
        ))}
        {clients.length === 0 && (
          <p className="rounded-2xl border bg-white p-5 text-sm text-slate-500">
            Aucun compte client trouvé.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Historique des alertes de déconnexion (&gt; 1h)
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Établissement</th>
                <th className="py-2 pr-3">Utilisateur hors-ligne</th>
                <th className="py-2 pr-3">Destinataires</th>
                <th className="py-2 pr-3">Canaux</th>
                <th className="py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{new Date(a.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3 font-semibold">{a.clientNom}</td>
                  <td className="py-2 pr-3">
                    {a.utilisateurNom || "—"} ({a.role})
                  </td>
                  <td className="py-2 pr-3">{a.telephoneCible || "—"}</td>
                  <td className="py-2 pr-3">{a.canaux.join(", ") || "—"}</td>
                  <td className="py-2 font-bold">{a.statut}</td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-400">
                    Aucune alerte de coupure enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
