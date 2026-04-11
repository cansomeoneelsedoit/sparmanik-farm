import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { en, type TranslationKey } from "./en";
import { id } from "./id";

type Lang = "en" | "id";

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("sparmanik_lang");
    return (saved === "id" ? "id" : "en") as Lang;
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("sparmanik_lang", l);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = lang === "id" ? id : en;
      return dict[key] ?? key;
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside I18nProvider");
  return ctx;
}
