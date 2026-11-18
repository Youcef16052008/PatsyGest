import Link from "next/link";

export const metadata = { title: "Mentions légales & CGU — PâtisGest" };

/**
 * Sprint 6 — mentions légales / CGU (cahier §5, exigences Algérie).
 *
 * ⚠️ MODÈLE À FAIRE VALIDER par le comptable conseil et un juriste avant toute
 * V1 commerciale. Le cahier des charges §5 le demande explicitement :
 * « à faire valider par le comptable conseil avant V1 commerciale ».
 */
export default function MentionsLegales() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-10 text-slate-800">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-600">PâtisGest · Pilote</p>
      <h1 className="mt-2 text-3xl font-black">Mentions légales & conditions d&apos;utilisation</h1>

      <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <b>Version pilote — document à faire valider.</b>
        <p className="mt-2">
          Ce texte est un modèle. Il doit être relu par le comptable conseil et un juriste avant
          toute utilisation commerciale. Aucune donnée réelle d&apos;un client final ne doit être
          saisie tant que cette validation n&apos;est pas faite.
        </p>
      </div>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-xl font-bold">1. Éditeur</h2>
        <p>
          PâtisGest — logiciel de gestion pour pâtisseries artisanales, édité pour le marché
          algérien. Les coordonnées complètes de l&apos;éditeur (raison sociale, NIF, NIS, RC,
          adresse, contact) doivent être complétées avant la mise en service commerciale.
        </p>

        <h2 className="pt-4 text-xl font-bold">2. Objet du service</h2>
        <p>
          PâtisGest aide à suivre les stocks, calculer les coûts de revient, planifier la
          production, tracer les lots et encaisser les ventes. Les calculs appliquent les formules
          du cahier des charges (parage, cuisson, main-d&apos;œuvre chargée, coût par portion
          hors taxes).
        </p>
        <p className="font-semibold">
          PâtisGest est un outil d&apos;aide à la décision. Il ne remplace ni la comptabilité
          légale, ni le conseil fiscal. Les résultats affichés dépendent des données saisies.
        </p>

        <h2 className="pt-4 text-xl font-bold">3. Fiscalité — TVA</h2>
        <p>
          TVA par défaut : <b>19 %</b> sur les ventes de pâtisserie fine (produits transformés) et{" "}
          <b>9 %</b> sur les achats de matières de base (farine, lait, sucre). Ces taux sont
          réglables par article. Le coût de revient est toujours calculé <b>hors taxes</b>
          (règle RC-05) : la TVA n&apos;entre jamais dans un coût.
        </p>

        <h2 className="pt-4 text-xl font-bold">4. Conservation des documents</h2>
        <p>
          Conformément au code de commerce algérien, les documents doivent être conservés
          <b> 10 ans</b>. PâtisGest fournit des exports CSV (mouvements, ventes, clôtures) et
          recommande une sauvegarde régulière hors de la plateforme.
        </p>

        <h2 className="pt-4 text-xl font-bold">5. Étiquetage et allergènes</h2>
        <p>
          Les étiquettes suivent le décret exécutif 13-378 : dénomination, ingrédients par ordre
          décroissant, quantité nette, DLC/DDM, conditions de conservation, nom et adresse du
          fabricant, numéro de lot, et mise en évidence des <b>14 allergènes</b> à déclaration
          obligatoire. PâtisGest déduit ces allergènes des matières de la recette. La
          responsabilité de la vérification finale de l&apos;étiquette reste celle de
          l&apos;exploitant.
        </p>

        <h2 className="pt-4 text-xl font-bold">6. Données personnelles — loi 18-07</h2>
        <p>
          Les données des clients (nom, téléphone) servis en pâtisserie sont collectées pour la
          seule exécution de la commande. Elles sont isolées par établissement (RLS) et ne sont
          accessibles qu&apos;aux comptes autorisés. Un export et une suppression sur demande sont
          possibles. Aucune donnée n&apos;est revendue.
        </p>

        <h2 className="pt-4 text-xl font-bold">7. Rôles et accès</h2>
        <p>
          Propriétaire : accès complet. Laboratoire : stocks, recettes, coûts, production.
          Vendeur : caisse, clôture et traçabilité en lecture — <b>il n&apos;a pas accès aux
          coûts de revient</b>.
        </p>

        <h2 className="pt-4 text-xl font-bold">8. Disponibilité et mode hors-ligne</h2>
        <p>
          Les ventes et les ordres de fabrication sont mis en file locale en cas de coupure réseau
          puis resynchronisés, sans doublon. L&apos;objectif de disponibilité annoncé est de
          99,5 % ; il n&apos;est pas garanti pendant la phase pilote.
        </p>

        <h2 className="pt-4 text-xl font-bold">9. Phase pilote</h2>
        <p>
          Le logiciel est en phase pilote. Certaines fonctions sont en cours de développement et
          des interruptions peuvent survenir. Un retour d&apos;expérience est attendu de chaque
          pâtisserie participante.
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/tableau-de-bord" className="font-bold text-violet-700">← Retour au tableau de bord</Link>
      </p>
    </article>
  );
}
