import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import {
  accountingApi,
  type AccountingEntry,
  type AccountingTotals,
} from "@/api/accounting";
import { fmtIDR, todayISO } from "@/lib/helpers";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

export function AccountingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [totals, setTotals] = useState<AccountingTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [list, tot] = await Promise.all([accountingApi.list(), accountingApi.totals()]);
      setEntries(list);
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

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await accountingApi.sync();
      alert(`${t("sync_done")}: +${result.sales_added} sales, +${result.wages_added} wages`);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("confirm_delete"))) return;
    try {
      await accountingApi.remove(id);
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
            {t("accounting")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("accounting_title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}>
            ↻ {syncing ? t("loading") : t("sync")}
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            + {t("new_entry_acct")}
          </button>
        </div>
      </div>

      {totals && (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <BigStat label={t("income")} value={fmtIDR(totals.income)} color="#4ADE80" />
          <BigStat label={t("expense")} value={fmtIDR(totals.expense)} color="#F87171" />
          <BigStat label={t("net")} value={fmtIDR(totals.net)} color="#FF6B35" />
        </div>
      )}

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

      {!loading && !error && (
        <div className="card overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>{t("date")}</Th>
                  <Th>{t("type")}</Th>
                  <Th>{t("description")}</Th>
                  <Th>{t("category")}</Th>
                  <Th>{t("source")}</Th>
                  <Th align="right">{t("amount")}</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                      {t("no_entries")}
                    </td>
                  </tr>
                ) : (
                  entries.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <Td><span className="mono text-xs">{a.date}</span></Td>
                      <Td>
                        <TypeChip type={a.type} />
                      </Td>
                      <Td>{a.description}</Td>
                      <Td><span style={{ color: "var(--text-dim)" }}>{a.category}</span></Td>
                      <Td>
                        <SourceChip source={a.source} />
                      </Td>
                      <Td align="right">
                        <span
                          className="mono"
                          style={{ color: a.type === "income" ? "var(--green)" : "var(--red)" }}
                        >
                          {a.type === "income" ? "+" : "-"}{fmtIDR(a.amount)}
                        </span>
                      </Td>
                      <Td align="right">
                        {a.source !== "auto" && (
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="rounded-md border px-2 py-1 text-xs"
                            style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
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
        <NewAcctModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refresh(); }} />
      )}
    </div>
  );
}

function BigStat({ label, value, color }: { label: string; value: string; color: string }) {
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

function TypeChip({ type }: { type: string }) {
  const { t } = useI18n();
  const isIncome = type === "income";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
      style={{
        background: isIncome ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
        color: isIncome ? "#4ADE80" : "#F87171",
        borderColor: isIncome ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
      }}
    >
      {t(type as any)}
    </span>
  );
}

function SourceChip({ source }: { source: string }) {
  const { t } = useI18n();
  if (source === "auto") {
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
        style={{
          background: "rgba(96,165,250,0.12)",
          color: "#60A5FA",
          borderColor: "rgba(96,165,250,0.2)",
        }}
      >
        {t("auto")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: "rgba(255,255,255,0.04)",
        color: "var(--text-dim)",
        borderColor: "var(--border)",
      }}
    >
      {t("manual")}
    </span>
  );
}

function NewAcctModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState(todayISO());
  const [type, setType] = useState("expense");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await accountingApi.create({
        date: d,
        type,
        description: desc,
        amount: parseFloat(amount),
        category: cat,
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
          {t("new_entry_acct")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("accounting")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("date")}</label>
              <input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("type")}</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="income">{t("income")}</option>
                <option value="expense">{t("expense")}</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">{t("description")}</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} required />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("category")}</label>
              <input className="input" value={cat} onChange={(e) => setCat(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("amount")}</label>
              <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
