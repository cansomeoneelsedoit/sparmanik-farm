import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { salesApi, type SalesStats } from "@/api/sales";
import { tasksApi, type Task } from "@/api/tasks";
import { inventoryApi, type InventoryItem } from "@/api/inventory";
import { LineChart, BarChart } from "@/components/Charts";
import { fmtIDR, todayISO, staffColor } from "@/lib/helpers";
import type { TranslationKey } from "@/i18n/en";

interface DashboardData {
  salesStats: SalesStats | null;
  tasks: Task[];
  lowStock: InventoryItem[];
}

export function DashboardPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<DashboardData>({
    salesStats: null,
    tasks: [],
    lowStock: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([salesApi.stats(), tasksApi.list(), inventoryApi.list({ low_stock: true })])
      .then(([salesStats, tasks, lowStock]) => {
        setData({ salesStats, tasks, lowStock });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-5 lg:p-10">
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 lg:p-10">
        <div
          className="card p-5"
          style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}
        >
          <div className="text-sm" style={{ color: "var(--red)" }}>
            {t("error")}: {error}
          </div>
        </div>
      </div>
    );
  }

  const { salesStats, tasks, lowStock } = data;
  const currentWeek = salesStats?.weekly[0];

  // Last 8 weeks for the trend chart (oldest first)
  const last8 = [...(salesStats?.weekly ?? [])].slice(0, 8).reverse();
  const trendData = last8.map((w) => ({
    label: `W${w.week}`,
    value: w.revenue,
  }));

  // Species breakdown for this week only
  const thisWeekSpecies = currentWeek
    ? (salesStats?.by_species ?? [])
        .slice(0, 5)
        .map((s) => ({
          label: t(s.species as TranslationKey) ?? s.species,
          value: s.revenue,
          valueLabel: `${Math.round(s.revenue / 1000)}K`,
          color: s.species.startsWith("chili") ? "#FF6B35" : "#FFB84D",
        }))
    : [];

  // Tasks due today or overdue, undone only
  const today = todayISO();
  const pending = tasks.filter((tk) => !tk.done);
  const overdueToday = pending
    .filter((tk) => tk.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-8">
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {t("overview")} · {t("this_week")}
        </div>
        <h1 className="serif text-4xl lg:text-5xl">
          {lang === "id" ? "Panen yang baik." : "Good harvest."}
        </h1>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("revenue")}
          value={currentWeek ? fmtIDR(currentWeek.revenue) : fmtIDR(0)}
          sub={currentWeek ? `Week ${currentWeek.week}` : ""}
          color="#FF6B35"
        />
        <StatCard
          label={t("kg_harvested")}
          value={currentWeek ? `${currentWeek.weight_kg.toFixed(1)} kg` : "0 kg"}
          sub={`${salesStats?.by_species.length ?? 0} species`}
          color="#4ADE80"
        />
        <StatCard
          label={t("wages_paid")}
          value="-"
          sub="Staff"
          color="#60A5FA"
        />
        <StatCard
          label={t("budget_status")}
          value="-"
          sub="Budget"
          color="#FFB84D"
        />
      </div>

      {/* Trend chart */}
      <div className="card mb-6 p-5 lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="serif text-2xl">{t("revenue_trend")}</h3>
        </div>
        <LineChart data={trendData} color="#FF6B35" height={220} />
      </div>

      {/* Two column: bar chart + today's tasks + low stock */}
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="card p-5 lg:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="serif text-2xl">{t("crop_breakdown")}</h3>
            <Link to="/sales" className="btn btn-ghost" style={{ minHeight: 32, padding: "6px 12px", fontSize: 11 }}>
              {t("view")} →
            </Link>
          </div>
          {thisWeekSpecies.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
              {t("no_entries")}
            </div>
          ) : (
            <BarChart data={thisWeekSpecies} height={240} />
          )}
        </div>

        <div>
          <div className="card mb-4 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="serif text-xl">{t("tasks")}</h3>
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                style={{
                  background: "rgba(255,107,53,0.12)",
                  color: "#FF6B35",
                  borderColor: "rgba(255,107,53,0.2)",
                }}
              >
                {overdueToday.length}
              </span>
            </div>
            {overdueToday.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                {t("no_tasks")}
              </div>
            ) : (
              overdueToday.slice(0, 4).map((tk) => {
                const isOver = tk.due_date < today;
                return (
                  <div key={tk.id} className="mb-3 flex items-center gap-3">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: isOver ? "var(--red)" : "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{tk.title}</div>
                      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {tk.assignees.join(", ")} · {isOver ? t("overdue") : t(tk.priority as TranslationKey)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="serif text-xl">{t("low_stock")}</h3>
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                style={{
                  background: "rgba(248,113,113,0.12)",
                  color: "#F87171",
                  borderColor: "rgba(248,113,113,0.2)",
                }}
              >
                {lowStock.length}
              </span>
            </div>
            {lowStock.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                {t("all_stocked")}
              </div>
            ) : (
              lowStock.slice(0, 4).map((inv) => (
                <div key={inv.id} className="mb-3 flex items-center gap-3">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: inv.quantity === 0 ? "var(--red)" : "var(--accent-2)",
                      flexShrink: 0,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{inv.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {inv.quantity} {inv.unit} · {t("reorder_at")} {inv.reorder_level}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: 1,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
      <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="serif mt-2 text-3xl">{value}</div>
      {sub && (
        <div className="mono mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
