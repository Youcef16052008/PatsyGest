"use client";
import { useActionState } from "react";
import { login } from "@/lib/actions-auth";
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, { erreur: "" });
  return <form action={action} className="space-y-3">
    <label className="pg-field">E-mail<input name="email" type="email" autoComplete="email" required className="pg-input" /></label>
    <label className="pg-field">Mot de passe<input name="motdepasse" type="password" autoComplete="current-password" required className="pg-input" /></label>
    {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
    <button disabled={pending} className="pg-button w-full">{pending ? "Connexion…" : "Se connecter"}</button>
  </form>;
}
