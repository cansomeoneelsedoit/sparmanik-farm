import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { plantingsApi, type Planting } from "@/api/plantings";
import { tasksApi, type Task } from "@/api/tasks";
import { staffColor, todayISO } from "@/lib/helpers";
import type { TranslationKey } from "@/i18n/en";

const VARIETIES = [
  "chili_red",
  "chili_keriting",
  "chili_green",
  "chili_bigred",
  "melon_yellow",
  "melon_rock",
];

const STAGES = ["seed", "veg", "flower", "fruit", "harvest"];

const STAGE_COLORS: Record<string, string> = {
  seed: "#A78BFA",
  veg: "#4ADE80",
  flower: "#FFB84D",
  fruit: "#FF6B35",
  harvest: "#F87171",
};

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

interface CalEvent {
  type: "plant" | "harvest" | "task";
  label: string;
  color: string;
  assignees?: string[];
}

export function CalendarPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewPlanting, setShowNewPlanting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [p, t] = await Promise.all([plantingsApi.list(), tasksApi.list()]);
      setPlantings(p);
      setTasks(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const allStaff = useMemo(() => {
    const s = new Set<string>();
    for (const tk of tasks) {
      for (const a of tk.assignees) s.add(a);
    }
    return Array.from(s).sort();
  }, [tasks]);

  // Build event map keyed by ISO date
  const events = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const p of plantings) {
      const variety = t(p.variety as TranslationKey) ?? p.variety;
      const pd = p.planting_date;
      if (!map[pd]) map[pd] = [];
      map[pd].push({ type: "plant", label: variety, color: "#4ADE80" });
      const hd = p.harvest_estimate;
      if (!map[hd]) map[hd] = [];
      map[hd].push({ type: "harvest", label: `${variety} ${t("harvest")}`, color: "#10B981" });
    }
    for (const tk of tasks) {
      if (filterStaff !== "all" && !tk.assignees.includes(filterStaff)) continue;
      const primary = filterStaff !== "all" ? filterStaff : (tk.assignees[0] ?? "Unknown");
      if (!map[tk.due_date]) map[tk.due_date] = [];
      map[tk.due_date].push({
        type: "task",
        label: tk.title,
        color: staffColor(primary),
        assignees: tk.assignees,
      });
    }
    return map;
  }, [plantings, tasks, filterStaff, lang, t]);

  // Build month grid
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const last = new Date(year, m + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const monthName = month.toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", {
    month: "long",
    year: "numeric",
  });

  const dayNames = lang === "id"
    ? ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const today = todayISO();

  const cells: { day: number | null; iso: string; events: CalEvent[] }[] = [];
  for (let i = 0; i < startDay; i++) {
    cells.push({ day: null, iso: "", events: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso, events: events[iso] ?? [] });
  }

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("calendar")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("calendar_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewPlanting(true)}>
          + {t("new_planting")}
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

      {/* Staff filter pills */}
      {allStaff.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mono mb-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("filter_by_staff")}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterPill
              label={t("all")}
              color="#999"
              active={filterStaff === "all"}
              onClick={() => setFilterStaff("all")}
            />
            {allStaff.map((name) => {
              const count = tasks.filter((tk) => !tk.done && tk.assignees.includes(name)).length;
              return (
                <FilterPill
                  key={name}
                  label={`${name}${count > 0 ? ` (${count})` : ""}`}
                  color={staffColor(name)}
                  active={filterStaff === name}
                  onClick={() => setFilterStaff(name)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Month grid */}
      <div className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "8px 14px", fontSize: 12 }}
            onClick={() => setMonth(new Date(year, m - 1, 1))}
          >
            ← {t("prev_month")}
          </button>
          <div className="serif text-2xl">{monthName}</div>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "8px 14px", fontSize: 12 }}
            onClick={() => setMonth(new Date(year, m + 1, 1))}
          >
            {t("next_month")} →
          </button>
        </div>

        <div className="cal-grid">
          {dayNames.map((d) => (
            <div key={d} className="cal-day-hdr">
              {d}
            </div>
          ))}
          {cells.map((c, i) => {
            if (c.day === null) {
              return <div key={i} className="cal-day other-month" />;
            }
            return (
              <div key={i} className={`cal-day${c.iso === today ? " today" : ""}`}>
                <div className="day-num">{c.day}</div>
                {c.events.slice(0, 3).map((ev, j) => (
                  <div
                    key={j}
                    className="cal-event"
                    style={{
                      background: `${ev.color}33`,
                      color: ev.color,
                    }}
                    title={ev.label}
                  >
                    {ev.label}
                  </div>
                ))}
                {c.events.length > 3 && (
                  <div className="cal-event" style={{ color: "var(--text-faint)" }}>
                    +{c.events.length - 3}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active plantings */}
      <h3 className="serif mb-3 mt-6 text-xl">{t("active_plantings")}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plantings.map((p) => {
          const stageColor = STAGE_COLORS[p.stage] ?? "#FF6B35";
          const variety = t(p.variety as TranslationKey) ?? p.variety;
          const stageLabel = t(`stage_${p.stage}` as TranslationKey) ?? p.stage;
          return (
            <div key={p.id} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">{variety}</div>
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                  style={{
                    background: `${stageColor}22`,
                    color: stageColor,
                    borderColor: `${stageColor}44`,
                  }}
                >
                  {stageLabel}
                </span>
              </div>
              <div className="mb-1 text-xs" style={{ color: "var(--text-faint)" }}>
                {t("beds")}: {p.beds}
              </div>
              <div className="mb-1 text-xs" style={{ color: "var(--text-faint)" }}>
                {t("planting_date")}: {p.planting_date}
              </div>
              <div className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
                {t("harvest_estimate")}: {p.harvest_estimate}
                {p.days_to_harvest >= 0
                  ? ` (${t("in_days").replace("{n}", p.days_to_harvest.toString())})`
                  : ` (${t("days_ago").replace("{n}", Math.abs(p.days_to_harvest).toString())})`}
              </div>
              {p.notes && (
                <div className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
                  {p.notes}
                </div>
              )}
              {isOwner && (
                <button
                  onClick={async () => {
                    if (!confirm(t("confirm_delete"))) return;
                    try {
                      await plantingsApi.remove(p.id);
                      refresh();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                  className="rounded-md border px-2 py-1 text-xs"
                  style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
                >
                  {t("delete")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showNewPlanting && (
        <NewPlantingModal onClose={() => setShowNewPlanting(false)} onSaved={() => { setShowNewPlanting(false); refresh(); }} />
      )}

      <style>{`
        .cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .cal-day-hdr {
          padding: 8px;
          text-align: center;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-faint);
          font-family: "JetBrains Mono", monospace;
        }
        .cal-day {
          min-height: 80px;
          padding: 6px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 10px;
          overflow: hidden;
        }
        .cal-day.other-month {
          background: transparent;
          border-color: transparent;
        }
        .cal-day.today {
          border-color: var(--accent);
          background: rgba(255,107,53,0.06);
        }
        .day-num {
          font-weight: 600;
          margin-bottom: 4px;
          font-size: 11px;
        }
        .cal-event {
          padding: 2px 5px;
          margin-bottom: 2px;
          border-radius: 4px;
          font-size: 9px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
        }
        @media (max-width: 640px) {
          .cal-day { min-height: 60px; padding: 4px; }
          .day-num { font-size: 10px; }
          .cal-event { font-size: 8px; padding: 1px 3px; }
        }
      `}</style>
    </div>
  );
}

function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
      style={{
        background: active ? `${color}33` : "rgba(255,255,255,0.04)",
        color: active ? color : "var(--text-dim)",
        borderColor: active ? color : "var(--border)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
        }}
      />
      {label}
    </button>
  );
}

function NewPlantingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [variety, setVariety] = useState("chili_red");
  const [pd, setPd] = useState(todayISO());
  const [hd, setHd] = useState(todayISO());
  const [beds, setBeds] = useState("");
  const [stage, setStage] = useState("seed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await plantingsApi.create({
        variety,
        planting_date: pd,
        harvest_estimate: hd,
        beds,
        stage,
        notes,
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
          {t("new_planting")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("planting")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("variety")}</label>
            <select className="input" value={variety} onChange={(e) => setVariety(e.target.value)}>
              {VARIETIES.map((v) => (
                <option key={v} value={v}>
                  {t(v as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("planting_date")}</label>
              <input className="input" type="date" value={pd} onChange={(e) => setPd(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("harvest_estimate")}</label>
              <input className="input" type="date" value={hd} onChange={(e) => setHd(e.target.value)} required />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">{t("beds")}</label>
            <input className="input" value={beds} onChange={(e) => setBeds(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="label">{t("stage")}</label>
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`stage_${s}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="label">{t("note")}</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
