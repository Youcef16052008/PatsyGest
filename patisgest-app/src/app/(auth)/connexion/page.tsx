import { demoEnabled } from "@/lib/auth";
import LoginForm from "./login-form";
import { quickDemoLogin } from "@/lib/actions-auth";
import { Icon } from "@/components/workspace-icons";
import { QuickColorMode } from "@/components/appearance";

export default function ConnexionPage() {
  return <main className="pg-login">
    <section className="pg-login-brand" aria-label="PâtisGest">
      <span className="pg-brand"><span className="pg-brand-mark"><Icon name="logo" size={24}/></span><span className="pg-brand-copy"><strong>PâtisGest</strong><small>Gestion pour pâtisseries</small></span></span>
      <div><p className="pg-kicker">Du labo à la boutique</p><p className="pg-login-tagline">La gestion au service de votre savoir-faire.</p></div>
    </section>
    <section className="pg-login-card">
      <div className="pg-login-heading"><div><p className="pg-kicker">Bienvenue</p><h1>Votre espace PâtisGest</h1></div><QuickColorMode/></div>
      <p className="pg-page-description">Connectez-vous pour retrouver vos stocks, vos ventes et vos commandes de gâteaux.</p>
      <LoginForm/>
      {demoEnabled() && <div className="pg-login-demo"><h2>Découvrir sans compte</h2><p>Démo locale avec des données fictives, sans connexion à votre établissement.</p>
        {[["amina@patisserie.dz", "Propriétaire"],["sara@patisserie.dz", "Laboratoire"],["amine@patisserie.dz", "Vendeur"]].map(([email, label]) => <form key={email} action={quickDemoLogin}>
          <input type="hidden" name="email" value={email}/><button type="submit" className="pg-button pg-button-secondary">Essayer · {label} <Icon name="arrow" size={17}/></button>
        </form>)}
      </div>}
    </section>
  </main>;
}
