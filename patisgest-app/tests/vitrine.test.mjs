import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  peutVitrine,
  peutEditerCatalogue,
  peutTraiterDemande,
  LIBELLES_ACTION,
} from '../src/lib/vitrine-permissions.ts';
import { resoudreHote, deciderRoutage } from '../src/lib/domaines.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Vitrine publique — règles métier demandées par le client.
 *
 * Ces tests verrouillent trois phrases précises du cahier des charges :
 *   « seul le labo ou le propriétaire peut changer les photos » ;
 *   « seul le propriétaire peut ajouter ou supprimer des recettes » ;
 *   « les vendeurs peuvent seulement accepter ou confirmer les commandes ».
 *
 * Le dernier bloc vérifie que la migration publique n'expose jamais un coût :
 * c'est la seule promesse qu'un visiteur anonyme pourrait vérifier.
 */

test('vitrine : le vendeur ne peut rien écrire dans le catalogue', () => {
  assert.equal(peutEditerCatalogue('vendeur'), false);
  assert.equal(peutVitrine('vendeur', 'ajouter_recette'), false);
  assert.equal(peutVitrine('vendeur', 'supprimer_recette'), false);
  assert.equal(peutVitrine('vendeur', 'modifier_photos'), false);
  assert.equal(peutVitrine('vendeur', 'publier_vitrine'), false);
  // …mais il voit la vitrine et traite les demandes : c'est son métier.
  assert.equal(peutVitrine('vendeur', 'voir_catalogue'), true);
  assert.equal(peutTraiterDemande('vendeur'), true);
});

test('vitrine : seules les photos sont ouvertes au laboratoire', () => {
  assert.equal(peutVitrine('labo', 'modifier_photos'), true);
  assert.equal(peutVitrine('labo', 'modifier_fiche'), true);
  // Ajouter ou supprimer une recette engage la gamme commerciale.
  assert.equal(peutVitrine('labo', 'ajouter_recette'), false);
  assert.equal(peutVitrine('labo', 'supprimer_recette'), false);
  assert.equal(peutVitrine('labo', 'publier_vitrine'), false);
});

test('vitrine : le propriétaire a toutes les actions', () => {
  for (const action of Object.keys(LIBELLES_ACTION)) {
    assert.equal(peutVitrine('proprietaire', action), true, `action ${action} refusée au propriétaire`);
  }
});

test('vitrine : aucune action sans libellé, et aucun libellé orphelin', () => {
  for (const [action, libelle] of Object.entries(LIBELLES_ACTION)) {
    assert.ok(libelle && libelle.length > 3, `libellé manquant pour ${action}`);
  }
});

test('vitrine : le routage par hôte distingue boutique et application', () => {
  assert.deepEqual(resoudreHote('elyasmine.patisgest.dz'), {
    type: 'boutique',
    sousDomaine: 'elyasmine',
  });
  // Les préfixes qui portent l'application ne sont jamais des boutiques.
  assert.equal(resoudreHote('app.patisgest.dz').type, 'application');
  assert.equal(resoudreHote('www.patisgest.dz').type, 'application');
  // Un hôte de prévisualisation n'est pas une vitrine cliente.
  assert.equal(resoudreHote('3000-abc.e2b.app').type, 'application');
  assert.equal(resoudreHote('patisgest.vercel.app').type, 'application');
});

test('vitrine : la vue publique ne contient aucune colonne de coût', () => {
  const sql = read('supabase/26-vitrine-publique.sql').toLowerCase();

  // On isole le bloc `create view ... vitrine_catalogue` pour ne pas
  // confondre avec les commentaires qui parlent des coûts.
  const debut = sql.indexOf('create or replace view public.vitrine_catalogue');
  assert.ok(debut > 0, 'vue vitrine_catalogue absente de la migration 26');
  const corps = sql.slice(debut, sql.indexOf('comment on view', debut));

  for (const interdit of ['mo_', 'energie', 'emballage', 'frais_generaux', 'ingredient', 'pu_ht', 'cout']) {
    assert.equal(
      corps.includes(interdit),
      false,
      `la vue publique expose « ${interdit} »`,
    );
  }
  // Les seules colonnes de prix admises sont le PV HT, la TVA et l'unité.
  assert.ok(corps.includes('pv_ht'), 'le prix de vente doit être publié');
  assert.ok(corps.includes('nullif(a.pv_ht, 0)'), 'un prix à 0 doit sortir à null, pas « 0 DA »');
});

test('vitrine : la vue publique est dédoublonnée sur le NOM de la recette', () => {
  const sql = read('supabase/26-vitrine-publique.sql');
  // `distinct on (client_id, cle_nom)` sur recette_familles : deux recettes
  // homonymes ne donnent qu'une entrée, et la clé ignore accents/casse.
  assert.match(sql, /distinct on \(f\.client_id, f\.cle_nom\)/);
  assert.match(sql, /from public\.recette_familles f/i);
  // Le dédoublonnage ne doit PAS se faire sur le produit lié : mesuré sur la
  // base, la famille « Cake » pointe sur l'article « Pâte feuilletée ».
  assert.equal(/distinct on \([^)]*produit_id/.test(sql), false);
});

test('vitrine : une demande de visiteur ne peut pas fixer son prix', () => {
  const sql = read('supabase/27-commandes-vitrine.sql');
  const debut = sql.indexOf('create or replace function public.patisgest_demander_commande');
  const fin = sql.indexOf('create or replace function public.patisgest_traiter_demande');
  const corps = sql.slice(debut, fin);

  // Aucun paramètre de prix/acompte/client_id dans la signature publique.
  assert.equal(/p_prix|p_acompte|p_client_id/.test(corps), false);
  // Le statut initial d'une demande est « demande », pas « devis ».
  assert.ok(corps.includes("'demande', false"), 'statut initial incorrect');
  // La clé d'idempotence est exigée et bornée.
  assert.match(corps, /length\(v_cle\) < 8/);
});

test('vitrine : une seule fonction du schéma est exécutable par anon', () => {
  const migrations = readdirSync(path.join(ROOT, 'supabase')).filter((f) => f.endsWith('.sql'));
  const ouvertes = [];
  for (const m of migrations) {
    const sql = read(path.join('supabase', m)).toLowerCase();
    const regex = /grant\s+execute\s+on\s+function\s+([\w.]+)\s*\([^)]*\)\s*to\s+([^;]+);/g;
    for (const [, nom, cibles] of sql.matchAll(regex)) {
      if (/\banon\b/.test(cibles)) ouvertes.push(`${nom.trim()} (${m})`);
    }
  }
  assert.deepEqual(
    ouvertes,
    ['public.patisgest_demander_commande (27-commandes-vitrine.sql)'],
    `fonctions inattendues ouvertes à anon : ${ouvertes.join(', ')}`,
  );
});

test('vitrine : la migration 28 retire les droits anon sur les tables internes', () => {
  const p = 'supabase/28-fermeture-anon.sql';
  assert.ok(existsSync(path.join(ROOT, p)), 'migration 28 absente');
  const sql = read(p).toLowerCase();
  assert.match(sql, /revoke all on public\.%i from anon/, 'les tables ne sont pas révoquées');
  assert.match(sql, /revoke all on function %s from anon/, 'les fonctions ne sont pas révoquées');
  // La vue publique doit survivre à la fermeture.
  assert.match(sql, /grant select on public\.vitrine_catalogue to anon/);
});

// --------------------------------------------------------------- routage

test('routage : un sous-domaine boutique mène à la vitrine', () => {
  const d = deciderRoutage('elyasmine.patisgest.dz', '/', '');
  assert.equal(d.type, 'reecrire');
  assert.equal(d.chemin, '/vitrine/elyasmine');
});

test('routage : la connexion reste accessible sur le sous-domaine', () => {
  // Le gérant doit pouvoir se connecter depuis l'adresse de sa vitrine.
  assert.equal(deciderRoutage('elyasmine.patisgest.dz', '/connexion', '').type, 'laisser');
  assert.equal(deciderRoutage('elyasmine.patisgest.dz', '/tableau-de-bord', '').type, 'laisser');
  assert.equal(deciderRoutage('elyasmine.patisgest.dz', '/api/sauvegarde', '').type, 'laisser');
});

test('routage : pas de boucle de réécriture', () => {
  assert.equal(deciderRoutage('elyasmine.patisgest.dz', '/vitrine/elyasmine', '').type, 'laisser');
});

test('routage : le domaine de l’application n’est jamais réécrit', () => {
  assert.equal(deciderRoutage('patisgest.dz', '/', '').type, 'laisser');
  assert.equal(deciderRoutage('app.patisgest.dz', '/', '').type, 'laisser');
  assert.equal(deciderRoutage('localhost:3000', '/', '').type, 'laisser');
  assert.equal(deciderRoutage('3000-abc.e2b.app', '/', '').type, 'laisser');
});

test('routage : un hôte inconnu n’est pas réécrit', () => {
  // Un domaine tiers ne doit pas devenir une vitrine par accident.
  assert.equal(deciderRoutage('patisserie-random.com', '/', '').type, 'laisser');
});

test('vitrine : les actions serveur passent par les RPC, pas par un update direct', () => {
  const src = read('src/lib/actions-vitrine.ts');
  // `recette_familles` n'a aucune policy d'écriture (mesuré en base) : un
  // `.from('recette_familles').update(...)` renverrait 0 ligne en silence.
  assert.equal(
    /from\(["']recette_familles["']\)\s*\.\s*update/.test(src),
    false,
    'écriture directe sur recette_familles : elle sera ignorée par la RLS',
  );
  assert.match(src, /rpc\("patisgest_enregistrer_fiche_vitrine"/);
  assert.match(src, /rpc\("patisgest_traiter_demande"/);
  assert.match(src, /rpc\("patisgest_supprimer_recette"/);
});

test('vitrine : les trois RPC d’écriture sont définies et gardées en base', () => {
  const sql = read('supabase/30-edition-vitrine-rpc.sql');
  for (const rpc of [
    'patisgest_enregistrer_fiche_vitrine',
    'patisgest_supprimer_recette',
  ]) {
    assert.ok(sql.includes(`function public.${rpc}`), `${rpc} absente`);
  }
  // Gardes de rôle explicites dans le corps des fonctions.
  assert.match(sql, /v_role not in \('proprietaire', 'labo'\)/);
  assert.match(sql, /v_role <> 'proprietaire'/);
  // Aucune des deux n'est ouverte à anon.
  assert.equal(/to\s+anon/i.test(sql), false, 'RPC d’écriture ouverte à anon');
});

// --------------------------------------------------- affichage & admin
import { libellePrix } from '../src/lib/vitrine-format.ts';

test('vitrine : un prix inconnu s’affiche « sur demande », jamais « 0 DA »', () => {
  // Cas réel mesuré : la famille « Cake » pointe sur un article à pv_ht = 0.
  assert.equal(libellePrix({ prixHt: null, unite: 'kg' }), 'Prix sur demande');
  assert.equal(libellePrix({ prixHt: 0, unite: 'kg' }).includes('0 DA'), true);
  // Un vrai prix garde son unité.
  assert.equal(libellePrix({ prixHt: 260, unite: 'pcs' }), '260 DA / pcs');
  assert.equal(libellePrix({ prixHt: 12.5, unite: null }), '12,5 DA');
});

test('vitrine : le formatage est un module pur (importable par un composant client)', () => {
  const src = read('src/lib/vitrine-format.ts');
  // `vitrine.ts` importe le client Supabase serveur (next/headers) : un
  // composant client qui l'importerait casse le build. Le formatage doit
  // donc rester dans un fichier sans dépendance.
  assert.equal(/^import /m.test(src), false, 'vitrine-format.ts ne doit avoir aucun import');
  const composant = read('src/components/vitrine-form.tsx');
  assert.match(composant, /from "@\/lib\/vitrine-format"/);
  assert.equal(
    /from "@\/lib\/vitrine"/.test(composant),
    false,
    'un composant client ne doit pas importer le module serveur',
  );
});

test('vitrine : l’écran d’admin respecte la matrice de rôles', () => {
  const src = read('src/components/vitrine-form.tsx');
  // Chaque action est conditionnée par le module de règles, jamais par un
  // test de chaîne de rôle écrit à la main (« role === 'vendeur' »).
  assert.match(src, /peutVitrine\(role, "publier_vitrine"\)/);
  assert.match(src, /peutVitrine\(role, "supprimer_recette"\)/);
  assert.equal(/role\s*===\s*["']/.test(src), false, 'rôle comparé en dur dans l’écran');
});

test('vitrine : publier passe par la RPC (le labo ne doit pas pouvoir publier)', () => {
  const actions = read('src/lib/actions-vitrine.ts');
  assert.match(actions, /rpc\("patisgest_publier_vitrine"/);
  assert.match(actions, /rpc\("patisgest_reserver_sous_domaine"/);

  // La policy `sites_update_staff` autorise propriétaire ET labo : publier
  // en `update` direct laisserait donc le laboratoire mettre un site en
  // ligne. La RPC 31 tranche au propriétaire.
  assert.equal(
    /from\(["']sites["']\)\s*\.\s*update/.test(actions),
    false,
    'publication par update direct : la policy laisse passer le labo',
  );
  const sql = read('supabase/31-publication-vitrine.sql');
  assert.match(sql, /v_role <> 'proprietaire'/);
  assert.match(sql, /Publiez au moins une recette/);
});

test('vitrine : le formulaire visiteur n’exige aucune session et ne fixe aucun prix', () => {
  const action = read('src/app/(vitrine)/vitrine/[slug]/commander/actions.ts');

  // Aucun contrôle de session : un visiteur doit pouvoir commander.
  assert.equal(/getSessionContext|requireSession/.test(action), false, 'le visiteur est authentifié ?!');
  // Aucun paramètre de prix/acompte n'est transmis à la RPC.
  assert.equal(/p_prix|p_acompte|prixHt:|cout/.test(action), false, 'le visiteur fixe un prix');
  // La clé d'idempotence accompagne chaque envoi.
  assert.match(action, /p_cle_navigateur: cleNavigateur/);
});

test('vitrine : la clé d’idempotence du formulaire est stable pendant la page', () => {
  const src = read('src/components/vitrine-commande.tsx');
  // `useState(() => …)` fige la clé au montage : une re-soumission renvoie
  // la même demande au lieu d'en créer une seconde.
  assert.match(src, /useState\(\(\) =>/);
  assert.match(src, /name="cleNavigateur"/);
  // Pas de génération dans le corps du rendu (elle changerait à chaque
  // frappe et créerait un doublon par tentative).
  assert.equal(/cleNavigateur\s*value=\{[^}]*randomUUID/.test(src), false);

  const sql = read('supabase/26-vitrine-publique.sql');
  assert.match(sql, /create unique index if not exists cakes_cle_vitrine_unique/);
});
