"use client";
import { useActionState } from "react";
import { login } from "@/lib/actions-auth";
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, { erreur: "" });
  return <form action={action} className="space-y-3">
    <label className="block text-sm font-semibold">E-mail<input name="email" type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
    <label className="block text-sm font-semibold">Mot de passe<input name="motdepasse" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
    {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
    <button disabled={pending} className="w-full rounded-lg bg-violet-700 p-3 font-bold text-white disabled:opacity-50">{pending ? "Connexion…" : "Se connecter"}</button>
  </form>;
}
