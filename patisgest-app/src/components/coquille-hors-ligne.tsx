"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import {
  cataloguePourIdentite,
  enregistrerIdentite,
  type CatalogueHorsLigne,
  type LectureCatalogue,
} from "@/lib/catalogue-cache";
import TrialGuardClient from "./trial-guard-client";

/**
 * NF-02 / D5 — contenu de la coquille hors-ligne.
 *
 * Règle tenue par ce composant : **rien de personnalisé avant la vérification
 * d'appartenance**. Le premier rendu ne contient que du texte générique. Le
 * catalogue n'apparaît qu'après `cataloguePourIdentite`, qui refuse un cache
 * appartenant à un autre compte, périmé, corrompu ou sans identité locale.
 *
 * Ce refus est le cœur de la conception : c'est ce qui permet de mettre cette
 * page en cache (donc de pouvoir l'ouvrir sans réseau) sans reproduire la fuite
 * que le service worker évite en refusant de cacher `/caisse`.
 */

type Etat =
  | { statut: "pret"; catalogue: CatalogueHorsLigne; ageJours: number }
  | { statut: "refus"; lecture: Extract<LectureCatalogue, { ok: false }> };

export default function CoquilleHorsLigne() {
  // Le localStorage est une source externe : on le lit par useSyncExternalStore
  // plutôt que par setState dans un effet. Le rendu serveur ne connaît pas le
  // localStorage — c'est aussi ce qui garantit qu'aucune donnée client ne part
  // dans le HTML mis en cache par le service worker.
  const cle = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    // La valeur textuelle de l'identité sert de clé de re-rendu : elle change
    // quand un autre compte se connecte sur le même appareil.
    () => {
      try {
        return window.localStorage.getItem("patisgest.session.v1") ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );

  const etat: Etat = useMemo(() => {
    if (!cle) return { statut: "refus", lecture: { ok: false, raison: "sans-identite" } };
    try {
      const v = JSON.parse(cle) as { clientId?: string; authUserId?: string };
      if (!v.clientId || !v.authUserId) {
        return { statut: "refus", lecture: { ok: false, raison: "sans-identite" } };
      }
      const lecture = cataloguePourIdentite(window.localStorage, v.clientId);
      return lecture.ok
        ? { statut: "pret", catalogue: lecture.catalogue, ageJours: lecture.ageJours }
        : { statut: "refus", lecture };
    } catch {
      return { statut: "refus", lecture: { ok: false, raison: "sans-identite" } };
    }
  }, [cle]);

  const enLigne = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    // Côté serveur on ne peut pas savoir : un booléen `false` garde le même
    // type que le snapshot client et n'annonce pas « connexion revenue ».
    () => false,
  );

  const activeScopeId = useMemo(() => {
    if (!cle) return "hors-ligne-device";
    try {
      const v = JSON.parse(cle) as { clientId?: string };
      return v.clientId || "hors-ligne-device";
    } catch {
      return "hors-ligne-device";
    }
  }, [cle]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <TrialGuardClient scopeId={activeScopeId} mode="hors-ligne" showBanner={false} />
      <h1 className="text-lg font-bold text-slate-900">Mode hors-ligne</h1>

      {enLigne === true ? (
        <p className="mt-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          La connexion est revenue. Vous pouvez revenir à la caisse normale : les tickets
          en attente s’enverront tout seuls.
        </p>
      ) : (
        <p className="mt-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Pas de réseau. Ce qui suit ne peut pas être envoyé maintenant, mais rien n’est
          perdu : les tickets enregistrés sur cet appareil partiront dès le retour du réseau.
        </p>
      )}

      {etat.statut === "refus" ? (
        <Refus raison={etat.lecture.raison} ageJours={etat.lecture.ageJours} />
      ) : (
        <Catalogue catalogue={etat.catalogue} ageJours={etat.ageJours} />
      )}
    </section>
  );
}

function Refus({
  raison,
  ageJours,
}: {
  raison: Extract<LectureCatalogue, { ok: false }>["raison"];
  ageJours?: number;
}) {
  const messages: Record<typeof raison, { titre: string; texte: string }> = {
    absent: {
      titre: "Aucune donnée n’a encore été conservée sur cet appareil",
      texte:
        "La caisse doit avoir été ouverte une première fois avec du réseau pour que les produits soient disponibles hors-ligne.",
    },
    illisible: {
      titre: "Les données conservées sur cet appareil sont illisibles",
      texte:
        "Ne les effacez pas : elles peuvent contenir des tickets non envoyés. Rouvrez la caisse avec du réseau ; si le problème persiste, contactez le support.",
    },
    "sans-identite": {
      titre: "Aucun compte connu sur cet appareil",
      texte:
        "Connectez-vous une première fois avec du réseau. Ce n’est qu’ensuite que cet appareil peut fonctionner sans connexion.",
    },
    "autre-compte": {
      titre: "Les données présentes appartiennent à un autre compte",
      texte:
        "Par précaution, elles ne sont pas affichées. Reconnectez le compte concerné avec du réseau, ou utilisez l’appareil de ce compte.",
    },
    perime: {
      titre: "Les prix conservés sont trop anciens",
      texte: `Le dernier enregistrement date de ${Math.floor(ageJours ?? 0)} jours. Encaisser avec des prix périmés créerait un écart de caisse : reconnectez-vous avec du réseau pour rafraîchir. Les tickets déjà enregistrés restent en attente et seront envoyés.`,
    },
  };
  const m = messages[raison];
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-bold text-slate-900">{m.titre}</h2>
      <p className="mt-1 text-sm text-slate-700">{m.texte}</p>
    </div>
  );
}

function Catalogue({ catalogue, ageJours }: { catalogue: CatalogueHorsLigne; ageJours: number }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-slate-700">
        <strong>{catalogue.clientNom}</strong> — catalogue conservé il y a{" "}
        {ageJours < 1 ? "moins d’une journée" : `${Math.floor(ageJours)} jour(s)`}.
      </p>

      {ageJours >= 2 ? (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Ce catalogue n’a pas été rafraîchi depuis {Math.floor(ageJours)} jours. Vérifiez les
          prix sur votre affichage avant d’encaisser.
        </p>
      ) : null}

      <h2 className="mt-4 text-sm font-bold text-slate-900">
        Produits ({catalogue.articles.length})
      </h2>
      <ul className="mt-1 max-h-72 divide-y overflow-auto text-sm">
        {catalogue.articles.map((a) => (
          <li key={a.id} className="flex justify-between gap-3 py-1.5">
            <span>{a.label}</span>
            <span className="text-slate-500">
              {typeof a.prixHT === "number" ? `${Math.round(a.prixHT)} DA` : "—"}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-slate-500">
        Les quantités en stock ne sont pas affichées : un stock figé induirait en erreur. Le
        manquant éventuel est calculé par le serveur au moment de l’envoi, et signalé sans
        jamais rendre le stock négatif.
      </p>

      <Link
        href="/caisse"
        className="mt-4 inline-block rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Ouvrir la caisse
      </Link>
    </div>
  );
}

/** Utilitaire exporté pour l'appelant qui veut enregistrer l'identité à la connexion. */
export { enregistrerIdentite };
