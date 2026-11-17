import { demoEnabled } from "@/lib/auth";
import LoginForm from "./login-form";
import { quickDemoLogin } from "@/lib/actions-auth";

export default function ConnexionPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
    <h1 className="text-3xl font-extrabold text-violet-900">🧁 PâtisGest</h1><p className="mb-6 mt-2 text-sm text-slate-500">Gestion de pâtisserie · Connexion</p>
    <LoginForm />
    {demoEnabled() && <div className="mt-6 border-t pt-5"><h2 className="font-bold">Démo locale</h2><p className="my-2 text-xs text-amber-800">Données fictives dans ce navigateur, sans connexion ni synchronisation Supabase. Ne pas utiliser pour des données réelles.</p>
      {[["amina@patisserie.dz", "Propriétaire"],["sara@patisserie.dz", "Laboratoire"],["amine@patisserie.dz", "Vendeur"]].map(([email, label]) => <form key={email} action={quickDemoLogin}><input type="hidden" name="email" value={email}/><button className="my-1 w-full rounded-lg border border-violet-200 bg-violet-50 p-2 text-left text-sm font-semibold hover:bg-violet-100">Essayer · {label} →</button></form>)}
    </div>}
  </div></main>;
}
