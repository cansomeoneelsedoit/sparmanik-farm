import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { staffApi, type StaffWage, type StaffProfile } from "@/api/staff";
import { fmtIDR, todayISO, getWeek } from "@/lib/helpers";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

export function StaffPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [wages, setWages] = useState<StaffWage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingItem, setEditingItem] = useState<StaffWage | null>(null);
  const [viewingProfile, setViewingProfile] = useState<StaffProfile | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [p, w] = await Promise.all([staffApi.profiles(), staffApi.list()]);
      setProfiles(p);
      setWages(w);
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
      await staffApi.remove(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Group wages by week descending
  const weekMap: Record<number, StaffWage[]> = {};
  for (const w of wages) {
    if (!weekMap[w.week]) weekMap[w.week] = [];
    weekMap[w.week].push(w);
  }
  const weeks = Object.keys(weekMap)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("staff")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("staff_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + {t("new_wage")}
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
          <button className="btn btn-ghost mt-3" onClick={refresh}>
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <h3 className="serif mb-3 text-xl">{t("staff_profile")}</h3>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => {
              const initials = p.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("");
              return (
                <button
                  key={p.name}
                  onClick={() => setViewingProfile(p)}
                  className="card p-5 text-left transition hover:brightness-110"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full font-semibold"
                      style={{
                        background: "linear-gradient(135deg,#FF6B35,#FFB84D)",
                        color: "white",
                      }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {p.role}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label={t("total_hours")} value={`${p.total_hours}h`} />
                    <Stat label={t("weeks_worked")} value={p.weeks_worked.toString()} />
                    <Stat label={t("total_earned")} value={fmtIDR(p.total_earned)} accent />
                  </div>
                </button>
              );
            })}
          </div>

          <h3 className="serif mb-3 text-xl">{t("weekly_entries")}</h3>
          {weeks.map((w) => {
            const entries = weekMap[w];
            const totalHours = entries.reduce((s, e) => s + e.hours, 0);
            const totalWage = entries.reduce((s, e) => s + e.wage_total, 0);
            return (
              <div key={w} className="mb-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="serif text-lg">
                    {t("week")} {w}
                  </h4>
                  <div className="mono text-sm" style={{ color: "var(--text-dim)" }}>
                    {totalHours}h · {fmtIDR(totalWage)}
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                          <Th>{t("staff_name")}</Th>
                          <Th>{t("role")}</Th>
                          <Th align="right">{t("hours")}</Th>
                          <Th align="right">{t("hourly_rate")}</Th>
                          <Th align="right">{t("wage_total")}</Th>
                          <Th></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td>{e.name}</Td>
                            <Td><span style={{ color: "var(--text-dim)" }}>{e.role}</span></Td>
                            <Td align="right"><span className="mono">{e.hours}</span></Td>
                            <Td align="right"><span className="mono" style={{ color: "var(--text-dim)" }}>{fmtIDR(e.hourly_rate)}</span></Td>
                            <Td align="right"><span className="mono font-medium">{fmtIDR(e.wage_total)}</span></Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingItem(e)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{ background: "rgba(255,255,255,0.04)", color: "var(--text)", borderColor: "var(--border)" }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDelete(e.id)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {showNew && (
        <NewWageModal item={null} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />
      )}

      {editingItem && (
        <NewWageModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); refresh(); }} />
      )}

      {viewingProfile && (
        <ProfileModal profile={viewingProfile} onClose={() => setViewingProfile(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-0.5 font-semibold" style={{ color: accent ? "var(--accent)" : undefined }}>
        {value}
      </div>
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
    <td style={{ padding: "12px 14px", textAlign: align ?? "left", fontSize: 13 }}>{children}</td>
  );
}

function ProfileModal({ profile, onClose }: { profile: StaffProfile; onClose: () => void }) {
  const { t } = useI18n();
  const initials = profile.name.split(" ").slice(0, 2).map((s) => s[0]).join("");
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
        <div className="mb-4 text-center">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
            style={{ background: "linear-gradient(135deg,#FF6B35,#FFB84D)", color: "white" }}
          >
            {initials}
          </div>
        </div>
        <h2 className="serif mb-1 text-center text-3xl">{profile.name}</h2>
        <div className="mb-6 text-center" style={{ color: "var(--text-dim)" }}>
          {profile.role}
        </div>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("total_hours")}
            </div>
            <div className="serif mt-1 text-2xl">{profile.total_hours}h</div>
          </div>
          <div className="card p-4 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("weeks_worked")}
            </div>
            <div className="serif mt-1 text-2xl">{profile.weeks_worked}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("total_earned")}
            </div>
            <div className="serif mt-1 text-2xl" style={{ color: "var(--accent)" }}>
              {fmtIDR(profile.total_earned)}
            </div>
          </div>
        </div>
        <h3 className="serif mb-3 text-xl">{t("history")}</h3>
        <div className="card overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>{t("week")}</Th>
                  <Th>{t("date")}</Th>
                  <Th align="right">{t("hours")}</Th>
                  <Th align="right">{t("wage_total")}</Th>
                </tr>
              </thead>
              <tbody>
                {profile.entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Td><span className="mono text-xs">W{e.week}</span></Td>
                    <Td><span className="mono text-xs">{e.date}</span></Td>
                    <Td align="right"><span className="mono">{e.hours}</span></Td>
                    <Td align="right"><span className="mono">{fmtIDR(e.wage_total)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button className="btn btn-ghost mt-6 w-full" onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}

function NewWageModal({ item, onClose, onSaved }: { item: StaffWage | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [role, setRole] = useState(item?.role ?? "");
  const [week, setWeek] = useState((item?.week ?? getWeek(new Date())).toString());
  const [d, setD] = useState(item?.date ?? todayISO());
  const [hours, setHours] = useState(item?.hours.toString() ?? "");
  const [rate, setRate] = useState(item?.hourly_rate.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const payload = {
      name,
      role,
      week: parseInt(week),
      date: d,
      hours: parseFloat(hours),
      hourly_rate: parseFloat(rate),
    };
    try {
      if (item) {
        await staffApi.update(item.id, payload);
      } else {
        await staffApi.create(payload);
      }
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
          {item ? t("edit") : t("new_wage")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("staff")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("staff_name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="label">{t("role")}</label>
            <input className="input" value={role} onChange={(e) => setRole(e.target.value)} required />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("week")}</label>
              <input className="input" type="number" value={week} onChange={(e) => setWeek(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("date")}</label>
              <input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} required />
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("hours")}</label>
              <input className="input" type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("hourly_rate")}</label>
              <input className="input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} required />
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
