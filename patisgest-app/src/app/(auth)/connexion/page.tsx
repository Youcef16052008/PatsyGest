"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions-auth";

const initialState = { erreur: "" };

export default function ConnexionPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-4xl">🧁</div>
          <h1 className="mt-2 text-2xl font-extrabold text-violet-900">
            PâtisGest
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Connecte-toi pour gérer ta pâtisserie
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-bold text-slate-700"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="amina@patisserie.dz"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="motdepasse"
              className="mb-1 block text-sm font-bold text-slate-700"
            >
              Mot de passe
            </label>
            <input
              id="motdepasse"
              name="motdepasse"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-600 focus:outline-none"
            />
          </div>

          {state.erreur && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {state.erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {pending ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Compte créé par le gérant — pas d&apos;inscription publique.
        </p>
      </div>
    </main>
  );
}
