"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, UI_DICT, translateUI, type Locale } from "@/lib/i18n";
import { enregistrerLangueUtilisateur } from "@/lib/actions-locale";

const LocaleContext = createContext<{
  locale: Locale;
  t: (typeof UI_DICT)[Locale];
  setLocale: (next: Locale) => void;
}>({
  locale: "fr",
  t: UI_DICT.fr,
  setLocale: () => {},
});

const ARABE = /[\u0600-\u06FF]/u;
const LATIN = /[A-Za-zÀ-ÿ]/u;

/** Un texte mixte AR + donnée FR reste éligible à la traduction du libellé FR. */
function estDejaArabe(texte: string): boolean {
  return ARABE.test(texte) && !LATIN.test(texte);
}
const ATTRS_TRADUISIBLES = ["title", "placeholder", "aria-label", "alt"] as const;
const BALISES_A_EXCLURE = "script,style,noscript,textarea,input,[data-i18n-skip]";

type EntreeTexte = { fr: string; ar: string };

/**
 * Filet de sécurité B.2 : les composants enfants rendent leur propre JSX et ne
 * sont pas traversés par un wrapper. Un MutationObserver traduit donc les nœuds
 * texte et les attributs de libellé après hydratation, en conservant le texte
 * français d'origine pour la bascule AR → FR. Les nœuds déjà en arabe (rendus
 * par React via `Tr`/`t`) sont laissés au rendu React.
 */
function useDomTranslation(locale: Locale) {
  const textes = useRef(new WeakMap<Text, EntreeTexte>());
  const attributs = useRef(new WeakMap<Element, Record<string, EntreeTexte>>());

  useEffect(() => {
    function cible(entree: EntreeTexte) {
      return locale === "ar" ? entree.ar : entree.fr;
    }

    function traiterTexte(noeud: Text) {
      const parent = noeud.parentElement;
      if (!parent || parent.closest(BALISES_A_EXCLURE)) return;
      const courant = noeud.nodeValue ?? "";
      const connu = textes.current.get(noeud);
      if (!connu) {
        if (estDejaArabe(courant)) return; // déjà traduit par React, ne pas mémoriser comme FR
        const entree = { fr: courant, ar: translateUI(courant, "ar") };
        textes.current.set(noeud, entree);
        if (locale === "ar" && entree.ar !== courant) noeud.nodeValue = entree.ar;
        return;
      }
      if (courant === connu.fr || courant === connu.ar) {
        const attendu = cible(connu);
        if (courant !== attendu) noeud.nodeValue = attendu;
      } else if (!estDejaArabe(courant)) {
        // Mise à jour naturelle d'un libellé français par l'application.
        connu.fr = courant;
        connu.ar = translateUI(courant, "ar");
        noeud.nodeValue = cible(connu);
      }
    }

    function traiterAttributs(element: Element) {
      if (element.closest(BALISES_A_EXCLURE)) return;
      let memoire = attributs.current.get(element);
      if (!memoire) {
        memoire = {};
        attributs.current.set(element, memoire);
      }
      for (const attr of ATTRS_TRADUISIBLES) {
        const courant = element.getAttribute(attr);
        if (courant == null) continue;
        let entree = memoire[attr];
        if (!entree) {
          if (estDejaArabe(courant)) continue;
          entree = { fr: courant, ar: translateUI(courant, "ar") };
          memoire[attr] = entree;
        }
        const attendu = cible(entree);
        if (courant !== attendu) element.setAttribute(attr, attendu);
      }
    }

    function parcourir(racine: Node) {
      if (racine.nodeType === Node.TEXT_NODE) {
        traiterTexte(racine as Text);
        return;
      }
      if (racine.nodeType !== Node.ELEMENT_NODE && racine.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      if (racine instanceof Element) traiterAttributs(racine);
      const walker = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let noeud = walker.nextNode();
      while (noeud) {
        if (noeud.nodeType === Node.TEXT_NODE) traiterTexte(noeud as Text);
        else if (noeud instanceof Element) traiterAttributs(noeud);
        noeud = walker.nextNode();
      }
    }

    parcourir(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") parcourir(mutation.target);
        else if (mutation.type === "attributes" && mutation.target instanceof Element) traiterAttributs(mutation.target);
        else if (mutation.type === "childList") {
          for (const ajoute of mutation.addedNodes) parcourir(ajoute);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS_TRADUISIBLES],
    });
    return () => observer.disconnect();
  }, [locale]);
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [, startTransition] = useTransition();
  const router = useRouter();
  useDomTranslation(locale);

  function setLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    startTransition(async () => {
      try {
        await enregistrerLangueUtilisateur(next);
      } catch {
        // Le cookie garde la préférence même si le profil est indisponible.
      }
      router.refresh();
    });
  }

  return (
    <LocaleContext.Provider value={{ locale, t: UI_DICT[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Traduit un libellé français exact (ou un fragment dynamique) en arabe. */
export function useTranslator() {
  const { locale } = useLocale();
  return (fr: string) => translateUI(fr, locale);
}

export function Tr({ fr, ar }: { fr: string; ar?: string }) {
  const { locale } = useLocale();
  return <>{locale === "ar" ? ar ?? translateUI(fr, "ar") : fr}</>;
}

const PROPS_TRADUISIBLES = new Set([
  "title",
  "aria-label",
  "ariaLabel",
  "placeholder",
  "alt",
  "label",
  "description",
  "text",
  "hint",
  "info",
  "subtitle",
  "kicker",
  "emptyText",
  "message",
  "error",
]);

function traduireNoeud(noeud: ReactNode, locale: Locale): ReactNode {
  if (typeof noeud === "string") return translateUI(noeud, locale);
  if (typeof noeud === "number" || typeof noeud === "boolean" || noeud == null) return noeud;
  if (Array.isArray(noeud)) return Children.map(noeud, (enfant) => traduireNoeud(enfant, locale));
  if (!isValidElement(noeud)) return noeud;

  const element = noeud as ReactElement<Record<string, unknown>>;
  if (element.type === "style" || element.type === "script" || element.type === "noscript") return element;

  const suivant: Record<string, unknown> = { ...element.props };
  for (const prop of PROPS_TRADUISIBLES) {
    const valeur = element.props[prop];
    if (typeof valeur === "string") suivant[prop] = translateUI(valeur, locale);
  }
  if ("children" in element.props && typeof element.props.children !== "function") {
    suivant.children = traduireNoeud(element.props.children as ReactNode, locale);
  }
  return cloneElement(element, suivant);
}

/** Traduction récursive des éléments passés en enfants (complète le filet DOM). */
export function AutoTr({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return <>{traduireNoeud(children, locale)}</>;
}

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "fr" ? "ar" : "fr")}
      className="pg-icon-button"
      title={locale === "fr" ? "Passer en arabe (العربية)" : "Passer en français"}
      aria-label={locale === "fr" ? "Langue : Français — basculer en arabe" : "اللغة: العربية — التبديل للفرنسية"}
      style={{ width: "auto", paddingInline: "10px", fontWeight: 800, fontSize: "0.78rem" }}
    >
      {locale === "fr" ? "عربي" : "FR"}
    </button>
  );
}
