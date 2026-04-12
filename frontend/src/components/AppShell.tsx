import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";

const navItems = [
  { to: "/", key: "dashboard" as const, icon: dashIcon() },
  { to: "/calendar", key: "calendar" as const, icon: calIcon() },
  { to: "/sales", key: "sales" as const, icon: salesIcon() },
  { to: "/harvest", key: "harvest" as const, icon: harvestIcon() },
  { to: "/tasks", key: "tasks" as const, icon: tasksIcon() },
  { to: "/inventory", key: "inventory" as const, icon: invIcon() },
  { to: "/recipes", key: "recipes" as const, icon: recipeIcon() },
  { to: "/sops", key: "sops" as const, icon: sopsIcon() },
  { to: "/videos", key: "videos" as const, icon: videoIcon() },
  { to: "/suppliers", key: "suppliers" as const, icon: supIcon() },
  { to: "/staff", key: "staff" as const, icon: staffIcon() },
  { to: "/accounting", key: "accounting" as const, icon: acctIcon() },
  { to: "/forecast", key: "forecast" as const, icon: forecastIcon() },
  { to: "/ai", key: "aichat" as const, icon: aiIcon() },
];

function sopsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function videoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function supIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function aiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function dashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

function calIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function staffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function acctIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function forecastIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function salesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function harvestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v16M6 8h12M9 5h6M8 12h8M7 16h10" />
    </svg>
  );
}

function tasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function invIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function recipeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.31" />
      <path d="M14 9.3V1.99" />
      <path d="M8.5 2h7" />
      <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar when route changes
  const close = () => setSidebarOpen(false);

  const initials = user?.name
    ?.split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("") ?? "";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed z-50 flex h-screen w-[260px] flex-col border-r transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{
          background: "var(--bg-2)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
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
              <div className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                {t("tagline")}
              </div>
            </div>
          </div>
          <button
            onClick={close}
            className="rounded-lg border p-1.5 lg:hidden"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderColor: "var(--border)",
            }}
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={close}
              className={({ isActive }) =>
                `mx-2.5 my-0.5 flex min-h-[44px] items-center gap-3 rounded-[10px] px-3.5 py-3 text-sm font-medium transition ${
                  isActive ? "nav-active" : "nav-idle"
                }`
              }
            >
              <span className="flex h-[18px] w-[18px] items-center justify-center">
                {item.icon}
              </span>
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>

        <div
          className="border-t p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full font-semibold"
              style={{
                background: "linear-gradient(135deg,#FF6B35,#FFB84D)",
                color: "white",
              }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div
                className="mono text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                {user?.role}
              </div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-ghost w-full" style={{ minHeight: 36, padding: "8px 14px", fontSize: 12 }}>
            {t("logout")}
          </button>
        </div>
      </aside>

      {/* Backdrop on mobile */}
      {sidebarOpen && (
        <div
          onClick={close}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-[260px]">
        {/* Mobile header */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-4 backdrop-blur lg:hidden"
          style={{
            background: "rgba(10,10,11,0.9)",
            borderColor: "var(--border)",
            paddingTop: "calc(1rem + env(safe-area-inset-top))",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderColor: "var(--border)",
            }}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("welcome")}
            </div>
            <div className="serif text-lg">{user?.name.split(" ")[0]}</div>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </header>

        {/* Desktop header */}
        <header
          className="sticky top-0 z-10 hidden border-b backdrop-blur lg:flex"
          style={{
            background: "rgba(10,10,11,0.8)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex w-full items-center justify-between gap-4 px-10 py-5">
            <div>
              <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {t("welcome")}
              </div>
              <div className="serif text-2xl">{user?.name.split(" ")[0]}</div>
            </div>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
        </header>

        <main key={location.pathname} className="fade-in flex-1">
          {children}
        </main>
      </div>

      <style>{`
        .nav-idle { color: var(--text-dim); }
        .nav-idle:hover { background: rgba(255,255,255,0.04); color: var(--text); }
        .nav-active {
          background: linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,107,53,0.05));
          color: var(--text);
          box-shadow: inset 0 0 0 1px rgba(255,107,53,0.2);
        }
        .fade-in { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

function LangToggle({ lang, setLang }: { lang: "en" | "id"; setLang: (l: "en" | "id") => void }) {
  return (
    <div
      className="inline-flex rounded-[10px] border p-[3px]"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderColor: "var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className="rounded-[7px] px-3 py-1.5 text-[11px] font-semibold transition"
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
        className="rounded-[7px] px-3 py-1.5 text-[11px] font-semibold transition"
        style={{
          background: lang === "id" ? "var(--accent)" : "transparent",
          color: lang === "id" ? "white" : "var(--text-dim)",
        }}
      >
        ID
      </button>
    </div>
  );
}
