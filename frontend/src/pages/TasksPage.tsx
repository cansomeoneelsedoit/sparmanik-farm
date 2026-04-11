import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { tasksApi, type Task } from "@/api/tasks";
import { downloadICS, staffColor, todayISO } from "@/lib/helpers";
import type { TranslationKey } from "@/i18n/en";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

// Known staff - in a later session we'll fetch these from the staff table
const KNOWN_STAFF = [
  "Agus Pranoto",
  "Sri Wahyuni",
  "Budi Santoso",
  "Dewi Lestari",
  "Boyd Sparrow",
  "Bintang Damanik",
  "Erni Damanik",
];

export function TasksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await tasksApi.list();
      setTasks(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const today = todayISO();
  const pending = tasks.filter((tk) => !tk.done);
  const done = tasks.filter((tk) => tk.done);
  const overdue = pending.filter((tk) => tk.due_date < today);
  const todayT = pending.filter((tk) => tk.due_date === today);
  const upcoming = pending.filter((tk) => tk.due_date > today);

  async function toggleDone(tk: Task) {
    try {
      await tasksApi.update(tk.id, { done: !tk.done });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDelete(tk: Task) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete") + "\n\n" + tk.title)) return;
    try {
      await tasksApi.remove(tk.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function downloadAll() {
    if (pending.length === 0) {
      alert(t("no_tasks"));
      return;
    }
    downloadICS("sparmanik-tasks.ics", pending);
  }

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("tasks")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("tasks_title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={downloadAll}>
            📅 {t("all_to_calendar")}
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            + {t("new_task")}
          </button>
        </div>
      </div>

      <div
        className="card mb-4 p-4"
        style={{
          background: "rgba(96,165,250,0.06)",
          borderColor: "rgba(96,165,250,0.2)",
        }}
      >
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>
          📱 {t("ics_hint")}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label={t("overdue")} count={overdue.length} color="#F87171" />
        <CountCard label={t("today")} count={todayT.length} color="#FF6B35" />
        <CountCard label={t("upcoming")} count={upcoming.length} color="#60A5FA" />
        <CountCard label={t("completed")} count={done.length} color="#4ADE80" />
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

      {!loading && !error && tasks.length === 0 && (
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("no_tasks")}
        </div>
      )}

      <TaskSection
        label={t("overdue")}
        color="var(--red)"
        items={overdue}
        onToggle={toggleDone}
        onDelete={handleDelete}
      />
      <TaskSection
        label={t("today")}
        color="var(--accent)"
        items={todayT}
        onToggle={toggleDone}
        onDelete={handleDelete}
      />
      <TaskSection
        label={t("upcoming")}
        color="var(--blue)"
        items={upcoming}
        onToggle={toggleDone}
        onDelete={handleDelete}
      />
      <TaskSection
        label={t("completed")}
        color="var(--green)"
        items={done}
        onToggle={toggleDone}
        onDelete={handleDelete}
      />

      {showNew && (
        <NewTaskModal
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

function CountCard({ label, count, color }: { label: string; count: number; color: string }) {
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
      <div className="serif mt-2 text-3xl" style={{ color }}>
        {count}
      </div>
    </div>
  );
}

function TaskSection({
  label,
  color,
  items,
  onToggle,
  onDelete,
}: {
  label: string;
  color: string;
  items: Task[];
  onToggle: (tk: Task) => void;
  onDelete: (tk: Task) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h3 className="serif mb-3 text-xl" style={{ color }}>
        {label}
      </h3>
      <div className="space-y-2">
        {items.map((tk) => (
          <TaskItem key={tk.id} task={tk} onToggle={() => onToggle(tk)} onDelete={() => onDelete(tk)} />
        ))}
      </div>
    </section>
  );
}

function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const pri = task.priority;
  const priColors: Record<string, { bg: string; color: string; border: string }> = {
    high: { bg: "rgba(248,113,113,0.12)", color: "#F87171", border: "rgba(248,113,113,0.2)" },
    medium: { bg: "rgba(255,184,77,0.12)", color: "#FFB84D", border: "rgba(255,184,77,0.2)" },
    low: { bg: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "rgba(96,165,250,0.2)" },
  };
  const p = priColors[pri] ?? priColors.medium;

  function downloadOne() {
    downloadICS(`task-${task.id}.ics`, [task]);
  }

  return (
    <div
      className="card flex items-start gap-3 p-4"
      style={{
        opacity: task.done ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Toggle done"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 6,
          border: task.done ? "none" : "2px solid var(--border-2)",
          background: task.done ? "var(--green)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginTop: 2,
        }}
      >
        {task.done && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="font-medium"
          style={{ textDecoration: task.done ? "line-through" : "none" }}
        >
          {task.title}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {task.assignees.map((a) => {
            const col = staffColor(a);
            return (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: `${col}22`,
                  color: col,
                  borderColor: `${col}44`,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: col,
                  }}
                />
                {a}
              </span>
            );
          })}
          <span className="mono" style={{ color: "var(--text-faint)" }}>
            {task.due_date}
          </span>
          <span
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={{ background: p.bg, color: p.color, borderColor: p.border }}
          >
            {t(pri as TranslationKey)}
          </span>
          {task.category && (
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "rgba(167,139,250,0.12)",
                color: "#A78BFA",
                borderColor: "rgba(167,139,250,0.2)",
              }}
            >
              {task.category}
            </span>
          )}
        </div>
        {task.notes && (
          <div className="mt-1.5 text-xs" style={{ color: "var(--text-faint)" }}>
            {task.notes}
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 gap-1">
        <button
          onClick={downloadOne}
          title={t("add_to_calendar")}
          className="rounded-md border px-2 py-1 text-xs"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "var(--border)",
          }}
        >
          📅
        </button>
        <button
          onClick={onDelete}
          className="rounded-md border px-2 py-1 text-xs"
          style={{
            background: "rgba(248,113,113,0.1)",
            color: "var(--red)",
            borderColor: "rgba(248,113,113,0.2)",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function NewTaskModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleAssignee(name: string) {
    const next = new Set(assignees);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setAssignees(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (assignees.size === 0) {
      setErr(t("pick_assignee"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await tasksApi.create({
        title,
        due_date: dueDate,
        priority,
        category,
        notes,
        done: false,
        assignees: Array.from(assignees),
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
          {t("new_task")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("tasks")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("task_title")}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="mb-4">
            <label className="label">
              {t("assigned_to")}{" "}
              <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--text-faint)" }}>
                ({t("tap_one_or_more")})
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {KNOWN_STAFF.map((name) => {
                const on = assignees.has(name);
                const col = staffColor(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleAssignee(name)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      background: on ? `${col}33` : "rgba(255,255,255,0.04)",
                      color: on ? col : "var(--text-dim)",
                      borderColor: on ? col : "var(--border)",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: col,
                      }}
                    />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("due_date")}</label>
              <input
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{t("priority")}</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">{t("high")}</option>
                <option value="medium">{t("medium")}</option>
                <option value="low">{t("low")}</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="label">{t("category")}</label>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Harvest, Nutrients..."
            />
          </div>

          <div className="mb-6">
            <label className="label">{t("note")}</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
