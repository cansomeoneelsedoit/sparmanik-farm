import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { salesApi, type Sale, type SalesStats } from "@/api/sales";
import { fmtIDR, todayISO, getWeek } from "@/lib/helpers";
import type { TranslationKey } from "@/i18n/en";

const SPECIES = [
  "chili_red",
  "chili_keriting",
  "chili_green",
  "chili_bigred",
  "melon_yellow",
  "melon_rock",
] as const;

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

export function SalesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [species, setSpecies] = useState("all");
  const [grade, setGrade] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [list, s] = await Promise.all([
        salesApi.list({ species, grade, period }),
        salesApi.stats(),
      ]);
      setSales(list);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [species, grade, period]);

  const hasFilters = species !== "all" || grade !== "all" || period !== "all";

  // Weekly rollup for the filtered set
  const weeklyFiltered = useMemo(() => {
    const m: Record<number, { kg: number; rev: number }> = {};
    for (const s of sales) {
      if (!m[s.week]) m[s.week] = { kg: 0, rev: 0 };
      m[s.week].kg += s.weight_kg;
      m[s.week].rev += s.total;
    }
    return Object.entries(m)
      .map(([w, d]) => ({ week: parseInt(w), ...d }))
      .sort((a, b) => b.week - a.week);
  }, [sales]);

  async function handleDelete(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("delete_sale_confirm"))) return;
    try {
      await salesApi.remove(id);
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
            {t("sales")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("sales_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + {t("new_sale")}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <label className="label">{t("species")}</label>
          <select className="input" value={species} onChange={(e) => setSpecies(e.target.value)}>
            <option value="all">{t("all")}</option>
            {SPECIES.map((s) => (
              <option key={s} value={s}>
                {t(s as TranslationKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px] flex-1">
          <label className="label">{t("grade")}</label>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">{t("all")}</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="label">{t("period")}</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">{t("period_all")}</option>
            <option value="week">{t("period_week")}</option>
            <option value="month">{t("period_month")}</option>
          </select>
        </div>
        {hasFilters && (
          <button
            className="btn btn-ghost"
            style={{ alignSelf: "flex-end", minHeight: 36, padding: "8px 14px", fontSize: 12 }}
            onClick={() => {
              setSpecies("all");
              setGrade("all");
              setPeriod("all");
            }}
          >
            {t("clear")}
          </button>
        )}
      </div>

      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      )}

      {error && (
        <div
          className="card mb-4 p-5"
          style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}
        >
          <div className="text-sm" style={{ color: "var(--red)" }}>
            {t("error")}: {error}
          </div>
          <button className="btn btn-ghost mt-3" onClick={refresh}>
            {t("retry")}
          </button>
        </div>
      )}

      {/* Weekly rollup */}
      {!loading && !error && weeklyFiltered.length > 0 && (
        <>
          <h3 className="serif mt-6 mb-3 text-xl">{t("by_week")}</h3>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {weeklyFiltered.slice(0, 4).map((w) => (
              <div key={w.week} className="card relative overflow-hidden p-5">
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, #FF6B35, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  {t("week")} {w.week}
                </div>
                <div className="serif mt-2 text-2xl">{fmtIDR(w.rev)}</div>
                <div className="mono mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {w.kg.toFixed(1)} kg
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="card overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>{t("date")}</Th>
                  <Th>{t("week")}</Th>
                  <Th>{t("species")}</Th>
                  <Th>{t("grade")}</Th>
                  <Th align="right">{t("weight_kg")}</Th>
                  <Th align="right">{t("price_per_kg")}</Th>
                  <Th align="right">{t("total")}</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                      {t("no_entries")}
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <Td>
                        <span className="mono text-xs">{s.date}</span>
                      </Td>
                      <Td>
                        <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                          W{s.week}
                        </span>
                      </Td>
                      <Td>{t(s.species as TranslationKey) ?? s.species}</Td>
                      <Td>
                        <GradeChip grade={s.grade} />
                      </Td>
                      <Td align="right">
                        <span className="mono">{s.weight_kg.toFixed(1)}</span>
                      </Td>
                      <Td align="right">
                        <span className="mono" style={{ color: "var(--text-dim)" }}>
                          {fmtIDR(s.price_per_kg)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="mono font-medium">{fmtIDR(s.total)}</span>
                      </Td>
                      <Td align="right">
                        {isOwner && (
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="rounded-md border px-2 py-1 text-xs"
                            style={{
                              background: "rgba(248,113,113,0.1)",
                              color: "var(--red)",
                              borderColor: "rgba(248,113,113,0.2)",
                            }}
                          >
                            ×
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <NewSaleModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" | "left" }) {
  return (
    <th
      style={{
        padding: "12px 14px",
        textAlign: align ?? "left",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 500,
        color: "var(--text-dim)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: "right" | "left" }) {
  return (
    <td
      style={{
        padding: "12px 14px",
        textAlign: align ?? "left",
        fontSize: 13,
      }}
    >
      {children}
    </td>
  );
}

function GradeChip({ grade }: { grade: string }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    A: {
      bg: "rgba(74,222,128,0.12)",
      color: "#4ADE80",
      border: "rgba(74,222,128,0.2)",
    },
    B: {
      bg: "rgba(255,184,77,0.12)",
      color: "#FFB84D",
      border: "rgba(255,184,77,0.2)",
    },
    C: {
      bg: "rgba(248,113,113,0.12)",
      color: "#F87171",
      border: "rgba(248,113,113,0.2)",
    },
  };
  const c = colors[grade] ?? colors.A;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
      style={{ background: c.bg, color: c.color, borderColor: c.border }}
    >
      {grade}
    </span>
  );
}

function NewSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const today = todayISO();
  const thisWeek = getWeek(new Date());

  const [saleDate, setSaleDate] = useState(today);
  const [week, setWeek] = useState(thisWeek.toString());
  const [species, setSpecies] = useState<string>("chili_red");
  const [grade, setGrade] = useState<string>("A");
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await salesApi.create({
        date: saleDate,
        week: parseInt(week),
        species,
        grade,
        weight_kg: parseFloat(weight),
        price_per_kg: parseFloat(price),
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
          {t("new_sale")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("sales")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("date")}</label>
              <input
                type="date"
                className="input"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{t("week")}</label>
              <input
                type="number"
                className="input"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">{t("species")}</label>
            <select className="input" value={species} onChange={(e) => setSpecies(e.target.value)}>
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {t(s as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="label">{t("grade")}</label>
            <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
            </select>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("weight_kg")}</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{t("price_per_kg")}</label>
              <input
                type="number"
                className="input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
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
