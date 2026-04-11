import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useInventory } from "@/hooks/useInventory";
import {
  inventoryApi,
  type InventoryItem,
  type AdjustReason,
  type InventoryAdjustment,
} from "@/api/inventory";
import type { TranslationKey } from "@/i18n/en";

const CATEGORIES = ["Nutrients", "Media", "Pots", "Irrigation", "Seeds", "Packaging", "Tools", "Other"] as const;
const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

function fmtIDR(n: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
}

function categoryLabel(cat: string, t: (k: TranslationKey) => string): string {
  const key = `cat_${cat}` as TranslationKey;
  return t(key) || cat;
}

export function InventoryPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { items, stats, loading, error, refresh, adjust } = useInventory({
    category,
    search: search || undefined,
  });

  const [editingItem, setEditingItem] = useState<InventoryItem | "new" | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [stockTakeActive, setStockTakeActive] = useState(false);

  // Group by category for display
  const grouped: Record<string, InventoryItem[]> = {};
  for (const it of items) {
    if (!grouped[it.category]) grouped[it.category] = [];
    grouped[it.category].push(it);
  }
  const groupKeys = Object.keys(grouped).sort();

  async function handleDelete(item: InventoryItem) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete") + "\n\n" + item.name)) return;
    try {
      await inventoryApi.remove(item.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (stockTakeActive) {
    return (
      <StockTakeFlow
        items={items}
        onExit={() => {
          setStockTakeActive(false);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="p-5 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("inventory")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("inventory_title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setStockTakeActive(true)}>
            📋 {t("stock_take")}
          </button>
          <button className="btn btn-primary" onClick={() => setEditingItem("new")}>
            + {t("new_item")}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label={t("total_value")} value={fmtIDR(stats.total_value)} color="#4ADE80" />
          <StatCard label={t("low_stock")} value={stats.low_stock_count.toString()} color="#FFB84D" />
          <StatCard label={t("out_of_stock")} value={stats.out_of_stock_count.toString()} color="#F87171" />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px] max-w-[240px]">
          <label className="label">{t("category")}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            <option value="all">
              {t("all")} ({stats?.total_items ?? 0})
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, t)} ({stats?.categories?.[c] ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px] max-w-[280px]">
          <label className="label">{t("search")}</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("item_name")}
            className="input"
          />
        </div>
        {(category !== "all" || search) && (
          <button
            className="btn btn-ghost"
            style={{ alignSelf: "flex-end", minHeight: 36, padding: "8px 14px", fontSize: 12 }}
            onClick={() => {
              setCategory("all");
              setSearch("");
            }}
          >
            {t("clear")}
          </button>
        )}
      </div>

      {loading && <div className="py-16 text-center text-sm" style={{ color: "var(--text-faint)" }}>{t("loading")}</div>}

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

      {!loading && !error && items.length === 0 && (
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {category !== "all" || search ? t("no_items_match") : t("no_items")}
        </div>
      )}

      {/* Groups */}
      {groupKeys.map((cat) => (
        <section key={cat} className="mb-8">
          <h3 className="serif mb-3 text-xl">{categoryLabel(cat, t)}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {grouped[cat].map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onAdjust={(delta) =>
                  adjust(item.id, { delta, reason: "correction" }).catch((e) => alert((e as Error).message))
                }
                onOpenAdjust={() => setAdjustingItem(item)}
                onEdit={() => setEditingItem(item)}
                onHistory={() => setHistoryItem(item)}
                onDelete={() => handleDelete(item)}
                canDelete={isOwner}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Modals */}
      {editingItem && (
        <ItemFormModal
          item={editingItem === "new" ? null : editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            refresh();
          }}
        />
      )}

      {adjustingItem && (
        <AdjustModal
          item={adjustingItem}
          onClose={() => setAdjustingItem(null)}
          onSaved={async (payload) => {
            await adjust(adjustingItem.id, payload).catch((e) => alert((e as Error).message));
            setAdjustingItem(null);
          }}
        />
      )}

      {historyItem && (
        <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </div>
  );
}

// ============================================================
// Stat card
// ============================================================
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="card relative overflow-hidden p-5"
      style={{
        background: "var(--card)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
      <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold lg:text-3xl">{value}</div>
    </div>
  );
}

// ============================================================
// Item card
// ============================================================
function ItemCard({
  item,
  onAdjust,
  onOpenAdjust,
  onEdit,
  onHistory,
  onDelete,
  canDelete,
}: {
  item: InventoryItem;
  onAdjust: (delta: number) => void;
  onOpenAdjust: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const pct = Math.min(100, item.reorder_level > 0 ? (item.quantity / (item.reorder_level * 2)) * 100 : 100);
  const barColor =
    item.status === "out" ? "var(--red)" : item.status === "low" ? "var(--accent-2)" : "var(--green)";

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        {item.photo_url && (
          <div
            className="h-12 w-12 flex-shrink-0 rounded-lg border"
            style={{
              background: `url(${item.photo_url}) center/cover`,
              borderColor: "var(--border)",
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{item.name}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {item.location}
          </div>
        </div>
        <StatusChip status={item.status} />
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <div className="serif text-3xl">{item.quantity}</div>
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          {item.unit}
        </div>
        <div className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>
          {t("reorder_at")} {item.reorder_level}
        </div>
      </div>

      <div
        className="mb-3 h-1.5 overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: barColor,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        <div>
          {t("value")}: <span className="mono">{fmtIDR(item.quantity * item.cost_per_unit)}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <MiniBtn onClick={() => onAdjust(-1)}>−</MiniBtn>
          <MiniBtn onClick={() => onAdjust(1)}>+</MiniBtn>
          <MiniBtn onClick={onOpenAdjust}>{t("adjust")}</MiniBtn>
          <MiniBtn onClick={onHistory}>{t("history")}</MiniBtn>
          <MiniBtn onClick={onEdit}>{t("edit")}</MiniBtn>
          {canDelete && (
            <MiniBtn onClick={onDelete} danger>
              ×
            </MiniBtn>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1.5 text-xs transition hover:brightness-125"
      style={
        danger
          ? {
              background: "rgba(248,113,113,0.1)",
              color: "var(--red)",
              borderColor: "rgba(248,113,113,0.2)",
              minWidth: 32,
            }
          : {
              background: "rgba(255,255,255,0.04)",
              borderColor: "var(--border)",
              color: "var(--text)",
              minWidth: 32,
            }
      }
    >
      {children}
    </button>
  );
}

function StatusChip({ status }: { status: InventoryItem["status"] }) {
  const { t } = useI18n();
  const map: Record<InventoryItem["status"], { label: string; bg: string; color: string; border: string }> = {
    in_stock: {
      label: t("in_stock"),
      bg: "rgba(74,222,128,0.12)",
      color: "#4ADE80",
      border: "rgba(74,222,128,0.2)",
    },
    low: {
      label: t("low_stock"),
      bg: "rgba(255,184,77,0.12)",
      color: "#FFB84D",
      border: "rgba(255,184,77,0.2)",
    },
    out: {
      label: t("out_of_stock"),
      bg: "rgba(248,113,113,0.12)",
      color: "#F87171",
      border: "rgba(248,113,113,0.2)",
    },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
      style={{
        background: s.bg,
        color: s.color,
        borderColor: s.border,
      }}
    >
      {s.label}
    </span>
  );
}

// ============================================================
// Modal shell
// ============================================================
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Create / edit item form
// ============================================================
function ItemFormModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [cat, setCat] = useState(item?.category ?? "Nutrients");
  const [qty, setQty] = useState(item?.quantity.toString() ?? "0");
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [reorder, setReorder] = useState(item?.reorder_level.toString() ?? "0");
  const [loc, setLoc] = useState(item?.location ?? "");
  const [cost, setCost] = useState(item?.cost_per_unit.toString() ?? "0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const payload = {
      name: name.trim(),
      category: cat,
      quantity: parseFloat(qty) || 0,
      unit: unit.trim() || "pcs",
      reorder_level: parseFloat(reorder) || 0,
      location: loc,
      cost_per_unit: parseFloat(cost) || 0,
    };
    try {
      if (item) {
        await inventoryApi.update(item.id, payload);
      } else {
        await inventoryApi.create(payload);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {item ? t("edit") : t("new_item")}
      </div>
      <h2 className="serif mb-6 text-3xl">{t("inventory")}</h2>
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <label className="label">{t("item_name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="label">{t("category")}</label>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, t)}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t("quantity")}</label>
            <input
              className="input"
              type="number"
              step="0.1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">{t("unit")}</label>
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("reorder_level")}</label>
            <input
              className="input"
              type="number"
              step="0.1"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("location")}</label>
            <input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("cost_per_unit")}</label>
            <input
              className="input"
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
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
    </Modal>
  );
}

// ============================================================
// Adjust modal (with reason dropdown)
// ============================================================
function AdjustModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: (payload: { new_quantity: number; reason: AdjustReason; note: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [newQty, setNewQty] = useState(item.quantity.toString());
  const [reason, setReason] = useState<AdjustReason>("correction");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reasons: { value: AdjustReason; label: string }[] = [
    { value: "stock_take", label: t("reason_stock_take") },
    { value: "used", label: t("reason_used") },
    { value: "wastage", label: t("reason_wastage") },
    { value: "received", label: t("reason_received") },
    { value: "correction", label: t("reason_correction") },
  ];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSaved({ new_quantity: parseFloat(newQty) || 0, reason, note });
    setSaving(false);
  }

  return (
    <Modal onClose={onClose}>
      <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {t("adjust")}
      </div>
      <h2 className="serif mb-6 text-3xl">{item.name}</h2>
      <div className="mb-4 text-sm" style={{ color: "var(--text-dim)" }}>
        {t("last_recorded")}: <span className="mono">{item.quantity} {item.unit}</span>
      </div>
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <label className="label">{t("set_to")} ({item.unit})</label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="mb-4">
          <label className="label">{t("reason")}</label>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-6">
          <label className="label">{t("note")}</label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            {saving ? t("loading") : t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// History modal
// ============================================================
function HistoryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { t } = useI18n();
  const [history, setHistory] = useState<InventoryAdjustment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    inventoryApi.adjustments(item.id).then(setHistory).catch((e) => setErr((e as Error).message));
  }, [item.id]);

  return (
    <Modal onClose={onClose}>
      <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {t("adjustment_history")}
      </div>
      <h2 className="serif mb-6 text-3xl">{item.name}</h2>
      {err && <div className="text-sm" style={{ color: "var(--red)" }}>{err}</div>}
      {!err && history === null && <div className="text-sm" style={{ color: "var(--text-faint)" }}>{t("loading")}</div>}
      {history && history.length === 0 && (
        <div className="text-sm" style={{ color: "var(--text-faint)" }}>{t("no_items")}</div>
      )}
      {history && history.length > 0 && (
        <div className="space-y-2">
          {history.map((a) => {
            const sign = a.delta > 0 ? "+" : "";
            const reasonLabel = t(`reason_${a.reason}` as TranslationKey) || a.reason;
            return (
              <div
                key={a.id}
                className="card p-3"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="mono font-semibold" style={{ color: a.delta > 0 ? "var(--green)" : "var(--red)" }}>
                        {sign}{a.delta}
                      </span>{" "}
                      <span style={{ color: "var(--text-dim)" }}>
                        ({a.old_quantity} → {a.new_quantity} {item.unit})
                      </span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                      {reasonLabel} · {t("by")} {a.user_name} · {new Date(a.created_at).toLocaleString()}
                    </div>
                    {a.note && <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>{a.note}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-6">
        <button className="btn btn-ghost w-full" onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// Stock take walkthrough
// ============================================================
function StockTakeFlow({ items, onExit }: { items: InventoryItem[]; onExit: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [currentItems, setCurrentItems] = useState(items);
  const [count, setCount] = useState("");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const item = currentItems[index];

  // Reset per item
  useEffect(() => {
    if (!item) return;
    setCount(item.quantity.toString());
    setPhotoBase64(null);
  }, [item?.id]);

  if (currentItems.length === 0) {
    return (
      <div className="p-10">
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("stock_take_empty")}
        </div>
        <button className="btn btn-ghost mt-4" onClick={onExit}>
          {t("exit")}
        </button>
      </div>
    );
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoBase64(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function handleSave(advance: boolean) {
    if (!item) return;
    setSaving(true);
    try {
      const n = parseFloat(count);
      if (!isNaN(n) && n !== item.quantity) {
        await inventoryApi.adjust(item.id, {
          new_quantity: n,
          reason: "stock_take",
          note: "",
        });
      }
      if (photoBase64) {
        await inventoryApi.setPhoto(item.id, photoBase64);
      }
      // Refresh the item in place
      const updated = await inventoryApi.list({}).then((all) => all.find((x) => x.id === item.id));
      if (updated) {
        setCurrentItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
      }
    } catch (e) {
      alert((e as Error).message);
      setSaving(false);
      return;
    }
    setSaving(false);
    if (!advance) return;
    if (index >= currentItems.length - 1) {
      alert("✓ " + t("stock_take_done"));
      onExit();
    } else {
      setIndex(index + 1);
    }
  }

  function handleExit() {
    if (confirm(t("exit_stock_take"))) onExit();
  }

  const progress = ((index + 1) / currentItems.length) * 100;

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mono mb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("stock_take")}
          </div>
          <h1 className="serif text-3xl">
            {t("item_of")} {index + 1} / {currentItems.length}
          </h1>
        </div>
        <button className="btn btn-ghost" onClick={handleExit}>
          {t("exit")}
        </button>
      </div>

      <div
        className="mb-6 h-1.5 overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
          }}
        />
      </div>

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-start gap-4">
          {item.photo_url ? (
            <div
              className="h-[120px] w-[120px] flex-shrink-0 rounded-xl border"
              style={{
                background: `url(${item.photo_url}) center/cover`,
                borderColor: "var(--border)",
              }}
            />
          ) : (
            <div
              className="flex h-[120px] w-[120px] flex-shrink-0 items-center justify-center rounded-xl text-4xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-faint)",
              }}
            >
              📦
            </div>
          )}
          <div className="min-w-[200px] flex-1">
            <div className="serif text-2xl">{item.name}</div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-faint)" }}>
              {item.category} · {item.location}
            </div>
            <div className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
              {t("last_recorded")}: <span className="mono">{item.quantity} {item.unit}</span>
            </div>
          </div>
        </div>

        <label className="label">{t("take_photo")}</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="input mb-3"
          style={{ padding: 10 }}
        />
        {photoBase64 && (
          <div className="mb-4 overflow-hidden rounded-xl" style={{ background: "var(--card-2)" }}>
            <img src={photoBase64} alt="" className="block h-[200px] w-full object-cover" />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("counted_quantity")}</label>
            <input
              type="number"
              step="0.1"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t("unit")}</label>
            <input value={item.unit} disabled className="input" style={{ opacity: 0.5 }} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {index > 0 && (
            <button className="btn btn-ghost" onClick={() => setIndex(index - 1)}>
              ← {t("previous")}
            </button>
          )}
          <button className="btn btn-ghost flex-1" onClick={() => handleSave(true)} disabled={saving}>
            {t("skip")}
          </button>
          <button className="btn btn-primary flex-1" onClick={() => handleSave(true)} disabled={saving}>
            {index === currentItems.length - 1 ? t("save_and_finish") : t("save_and_next")} →
          </button>
        </div>
      </div>
    </div>
  );
}
