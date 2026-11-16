import { ROLE_LABELS, canWrite, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MODULES_SPRINT2 = [
  "📦 Articles & stocks FEFO",
  "🧾 Achats & fournisseurs",
  "📖 Recettes & coûts",
  "👨‍🍳 Production (OF)",
  "💰 Caisse & clôture",
];

export default async function TableauDeBordPage() {
  const ctx = await requireSession();
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("id, nom, type")
    .order("nom");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          👋 Bienvenue, {ctx.clientNom}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sprint 1 : socle en place — connexion, rôle{" "}
          <strong>{ROLE_LABELS[ctx.role]}</strong>, isolement client actif.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Mon rôle
          </div>
          <div className="mt-1 text-xl font-extrabold text-violet-900">
            {ROLE_LABELS[ctx.role]}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {canWrite(ctx.role)
              ? "Tu peux écrire (stocks, recettes, production)."
              : "Accès caisse + lecture."}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Mes sites
          </div>
          <div className="mt-1 text-xl font-extrabold text-violet-900">
            {sites?.length ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {(sites ?? []).map((s) => s.nom).join(" · ") || "Aucun site"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-bold uppercase text-slate-400">
            Sécurité
          </div>
          <div className="mt-1 text-xl font-extrabold text-emerald-700">
            🔒 RLS active
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Tu ne vois que les données de ta boutique.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-extrabold">✅ Sprint 1 — validé</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>☑ Connexion e-mail + mot de passe</li>
          <li>☑ 3 rôles : propriétaire, labo, vendeur</li>
          <li>☑ Isolement client (RLS sur toutes les tables)</li>
          <li>☑ Déconnexion + garde des pages privées</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
        <h2 className="font-extrabold text-violet-900">
          🚀 Sprint 2 — bientôt
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-violet-900">
          {MODULES_SPRINT2.map((m) => (
            <li key={m}>☐ {m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
