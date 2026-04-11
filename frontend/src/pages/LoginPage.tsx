import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { ApiError } from "@/api/client";

export function LoginPage() {
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) setError(t("login_error"));
      else setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Hero side */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(255,107,53,0.15), transparent 50%), radial-gradient(ellipse at bottom right, rgba(74,222,128,0.1), transparent 50%), linear-gradient(135deg,#15151A 0%,#0A0A0B 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg,#FF6B35,#FFB84D)",
              color: "white",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2s4 3 4 8-4 12-4 12-4-7-4-12 4-8 4-8z" />
              <path d="M8 10c-3 2-5 4-5 4s3 1 6-1" />
              <path d="M16 10c3 2 5 4 5 4s-3 1-6-1" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">{t("brand")}</div>
            <div className="mono text-xs" style={{ color: "var(--text-faint)" }}>
              {t("tagline")}
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="mono mb-4 text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
            {t("tagline")}
          </div>
          <h1 className="serif mb-6 text-6xl leading-none">
            {t("hero").split(" with ")[0]}
            <br />
            with {t("hero").split(" with ")[1] ?? ""}
          </h1>
          <p className="max-w-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {t("hero_sub")}
          </p>
        </div>

        <div className="mono relative z-10 flex items-center gap-3 text-xs" style={{ color: "var(--text-faint)" }}>
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />
          Sumatera Utara, Indonesia
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="mono mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                {t("login")}
              </div>
              <h2 className="serif text-4xl">{t("welcome_title")}</h2>
            </div>
            <div
              className="inline-flex rounded-xl border p-1"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderColor: "var(--border)",
              }}
            >
              <button
                type="button"
                onClick={() => setLang("en")}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  background: lang === "en" ? "var(--accent)" : "transparent",
                  color: lang === "en" ? "white" : "var(--text-dim)",
                }}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("id")}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  background: lang === "id" ? "var(--accent)" : "transparent",
                  color: lang === "id" ? "white" : "var(--text-dim)",
                }}
              >
                ID
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit}>
            <div className="mb-4">
              <label className="label" htmlFor="email">
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@farm.id"
                className="input"
              />
            </div>

            <div className="mb-4">
              <label className="label" htmlFor="password">
                {t("password")}
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            {error && (
              <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full">
              {submitting ? t("loading") : `${t("login")} →`}
            </button>
          </form>

          <p className="mt-8 text-xs" style={{ color: "var(--text-faint)" }}>
            {t("login_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
