"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, UI_DICT, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<{
  locale: Locale;
  t: (typeof UI_DICT)[Locale];
  setLocale: (next: Locale) => void;
}>({
  locale: "fr",
  t: UI_DICT.fr,
  setLocale: () => {},
});

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  function setLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    router.refresh();
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

export function Tr({ fr, ar }: { fr: string; ar: string }) {
  const { locale } = useLocale();
  return <>{locale === "ar" ? ar : fr}</>;
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
