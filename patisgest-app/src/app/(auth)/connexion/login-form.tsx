"use client";
import { useActionState, useState } from "react";
import { login } from "@/lib/actions-auth";
import { creerComptePatisserie, type LicenceActionState } from "@/lib/actions-licence";

export default function LoginForm() {
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [loginState, loginAction, loginPending] = useActionState(login, { erreur: "" });
  const [signupState, signupAction, signupPending] = useActionState(
    creerComptePatisserie,
    {} as LicenceActionState,
  );

  return (
    <div className="space-y-4">
      <div className="pg-segment w-full" role="tablist" aria-label="Connexion ou création de compte">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "connexion"}
          onClick={() => setMode("connexion")}
          className="flex-1"
        >
          Se connecter
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "inscription"}
          onClick={() => setMode("inscription")}
          className="flex-1"
        >
          Créer un compte (essai 90 j)
        </button>
      </div>

      {mode === "connexion" ? (
        <form action={loginAction} className="space-y-3">
          <label className="pg-field">
            E-mail
            <input name="email" type="email" autoComplete="email" required className="pg-input" />
          </label>
          <label className="pg-field">
            Mot de passe
            <input
              name="motdepasse"
              type="password"
              autoComplete="current-password"
              required
              className="pg-input"
            />
          </label>
          {loginState.erreur && (
            <p role="alert" className="text-sm text-red-700">
              {loginState.erreur}
            </p>
          )}
          <button disabled={loginPending} className="pg-button w-full">
            {loginPending ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      ) : (
        <form action={signupAction} className="space-y-3">
          <p className="text-xs text-slate-600">
            Chaque nouveau compte bénéficie d’un <strong>mode d’essai de 90 jours</strong> (3 mois)
            configurable depuis l’espace Master.
          </p>
          <label className="pg-field">
            Nom de votre pâtisserie
            <input
              name="nomEtablissement"
              required
              maxLength={100}
              placeholder="Ex. Pâtisserie El Yasmine"
              className="pg-input"
            />
          </label>
          <label className="pg-field">
            Votre nom complet (Propriétaire)
            <input
              name="nomProprietaire"
              required
              maxLength={100}
              placeholder="Ex. Amina Benali"
              className="pg-input"
            />
          </label>
          <label className="pg-field">
            Téléphone (SMS / WhatsApp)
            <input
              name="telephone"
              type="tel"
              maxLength={40}
              placeholder="0550 00 00 00"
              className="pg-input"
            />
          </label>
          <label className="pg-field">
            E-mail
            <input name="email" type="email" autoComplete="email" required className="pg-input" />
          </label>
          <label className="pg-field">
            Mot de passe (8 caractères min.)
            <input
              name="motdepasse"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="pg-input"
            />
          </label>
          {signupState.erreur && (
            <p role="alert" className="text-sm text-red-700">
              {signupState.erreur}
            </p>
          )}
          {signupState.succes && (
            <p role="status" className="text-sm text-emerald-700">
              {signupState.succes}
            </p>
          )}
          <button disabled={signupPending} className="pg-button w-full">
            {signupPending ? "Création de l’espace…" : "Démarrer mon essai gratuit (90 jours)"}
          </button>
        </form>
      )}
    </div>
  );
}
