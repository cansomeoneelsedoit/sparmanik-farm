import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { forecastApi, type ForecastBudget, type ForecastTotals } from "@/api/forecast";
import { fmtIDR } from "@/lib/helpers";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

export function ForecastPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [budgets, setBudgets] = useState<ForecastBudget[]>([]);
  const [totals, setTotals] = useState<ForecastTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [list, tot] = await Promise.all([forecastApi.list(), forecastApi.totals()]);
      setBudgets(list);
      setTotals(tot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete"))) return;
    try {
      await forecastApi.remove(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("forecast")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("forecast_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + {t("new_budget")}
        </button>
      </div>

      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      )}

      {error && (
        <div className="card mb-4 p-5" style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}>
          <div className="text-sm" style={{ color: "var(--red)" }}>
            {t("error")}: {error}
          </div>
        </div>
      )}

      {totals && (
        <div className="card mb-6 p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Total · {t("auto_linked")}
            </span>
            <span
              className="mono text-sm"
              style={{ color: totals.over_budget ? "var(--red)" : "var(--green)" }}
            >
              {totals.over_budget ? t("over_budget") : t("under_budget")} ·{" "}
              {fmtIDR(Math.abs(totals.total_actual - totals.total_budgeted))}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-baseline gap-4">
            <div className="serif text-4xl">{fmtIDR(totals.total_actual)}</div>
            <div style={{ color: "var(--text-dim)" }}>
              of {fmtIDR(totals.total_budgeted)}
            </div>
          </div>
          <ProgressBar pct={totals.pct} over={totals.over_budget} />
        </div>
      )}

      {budgets.map((b) => (
        <div key={b.id} className="card mb-3 p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="serif text-lg">{b.category}</h4>
            <div
              className="mono text-sm"
              style={{ color: b.variance > 0 ? "var(--red)" : "var(--green)" }}
            >
              {b.variance > 0 ? "+" : ""}{fmtIDR(b.variance)}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-baseline gap-2 text-sm">
            <span className="mono">{fmtIDR(b.actual)}</span>
            <span style={{ color: "var(--text-faint)" }}>of {fmtIDR(b.budgeted)}</span>
            <span className="mono ml-auto text-xs" style={{ color: "var(--text-faint)" }}>
              {b.pct.toFixed(0)}%
            </span>
          </div>
          <ProgressBar pct={b.pct} over={b.actual > b.budgeted} />
          {isOwner && (
            <div className="mt-3 text-right">
              <button
                onClick={() => handleDelete(b.id)}
                className="rounded-md border px-2 py-1 text-xs"
                style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
              >
                {t("delete")}
              </button>
            </div>
          )}
        </div>
      ))}

      {showNew && (
        <NewBudgetModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />
      )}
    </div>
  );
}

function ProgressBar({ pct, over }: { pct: number; over: boolean }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.06)" }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: over ? "var(--red)" : "linear-gradient(90deg, var(--accent), var(--accent-2))",
          borderRadius: 999,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

function NewBudgetModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [cat, setCat] = useState("");
  const [budgeted, setBudgeted] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const period = new Date().toISOString().slice(0, 7);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await forecastApi.create({
        category: cat,
        budgeted: parseFloat(budgeted),
        period,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:p-5"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[95vh] w-full max-w-[600px] overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8"
        style={{ borderColor: "var(--border-2)" }}
      >
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {t("new_budget")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("forecast")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("category")}</label>
            <input
              className="input"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              placeholder={t("category_match_hint")}
              required
            />
          </div>
          <div className="mb-6">
            <label className="label">{t("budgeted")}</label>
            <input
              className="input"
              type="number"
              value={budgeted}
              onChange={(e) => setBudgeted(e.target.value)}
              required
            />
          </div>
          {err && (
            <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
