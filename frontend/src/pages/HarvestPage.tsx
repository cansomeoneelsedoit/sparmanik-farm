import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import {
  harvestApi,
  type RawMaterial,
  type RawPurchase,
  type MixedNutrient,
  type MixingLogEntry,
  type HarvestUsageEntry,
  type Part,
  type PartPurchase,
  type PartUsageEntry,
  type HarvestExpense,
  type HarvestIncome,
  type HarvestSummary,
} from "@/api/harvest";
import { fmtIDR, todayISO } from "@/lib/helpers";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

const EXPENSE_CATEGORIES = ["Labour", "Nutrients", "Growing Media", "Utilities", "Harvest Staff", "Consulting", "Pest Prevention", "Other"];

type Tab = "dashboard" | "raw" | "mixing" | "usage" | "parts" | "expenses" | "income";

export function HarvestPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [harvestName, setHarvestName] = useState("Melon Harvest 1");

  // Raw Materials
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [rawPurchases, setRawPurchases] = useState<RawPurchase[]>([]);
  const [showNewRaw, setShowNewRaw] = useState(false);
  const [editingRaw, setEditingRaw] = useState<RawMaterial | null>(null);
  const [showNewRawPurchase, setShowNewRawPurchase] = useState(false);
  const [editingRawPurchase, setEditingRawPurchase] = useState<RawPurchase | null>(null);

  // Mixed Nutrients
  const [mixedNutrients, setMixedNutrients] = useState<MixedNutrient[]>([]);
  const [mixingLog, setMixingLog] = useState<MixingLogEntry[]>([]);
  const [showNewMixed, setShowNewMixed] = useState(false);
  const [editingMixed, setEditingMixed] = useState<MixedNutrient | null>(null);
  const [showNewMixingLog, setShowNewMixingLog] = useState(false);

  // Harvest Usage
  const [harvestUsage, setHarvestUsage] = useState<HarvestUsageEntry[]>([]);
  const [showNewHarvestUsage, setShowNewHarvestUsage] = useState(false);

  // Parts
  const [parts, setParts] = useState<Part[]>([]);
  const [partPurchases, setPartPurchases] = useState<PartPurchase[]>([]);
  const [partUsage, setPartUsage] = useState<PartUsageEntry[]>([]);
  const [showNewPart, setShowNewPart] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [showNewPartPurchase, setShowNewPartPurchase] = useState(false);
  const [showNewPartUsage, setShowNewPartUsage] = useState(false);

  // Expenses
  const [expenses, setExpenses] = useState<HarvestExpense[]>([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<HarvestExpense | null>(null);

  // Income
  const [income, setIncome] = useState<HarvestIncome[]>([]);
  const [showNewIncome, setShowNewIncome] = useState(false);
  const [editingIncome, setEditingIncome] = useState<HarvestIncome | null>(null);

  // Summary
  const [summary, setSummary] = useState<HarvestSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [rm, rp, mn, ml, hu, pt, pp, pu, exp, inc, summ] = await Promise.all([
        harvestApi.listRawMaterials(),
        harvestApi.listRawPurchases(),
        harvestApi.listMixedNutrients(),
        harvestApi.listMixingLog(),
        harvestApi.listHarvestUsage(),
        harvestApi.listParts(),
        harvestApi.listPartPurchases(),
        harvestApi.listPartUsage(),
        harvestApi.listExpenses(harvestName),
        harvestApi.listIncome(harvestName),
        harvestApi.summary(harvestName),
      ]);
      setRawMaterials(rm);
      setRawPurchases(rp);
      setMixedNutrients(mn);
      setMixingLog(ml);
      setHarvestUsage(hu);
      setParts(pt);
      setPartPurchases(pp);
      setPartUsage(pu);
      setExpenses(exp);
      setIncome(inc);
      setSummary(summ);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [harvestName]);

  async function handleDeleteRaw(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this raw material?")) return;
    try {
      await harvestApi.deleteRawMaterial(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteRawPurchase(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this purchase?")) return;
    try {
      await harvestApi.deleteRawPurchase(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteMixed(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this mixed nutrient?")) return;
    try {
      await harvestApi.deleteMixedNutrient(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteMixingLog(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this mixing log entry?")) return;
    try {
      await harvestApi.deleteMixingLog(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteHarvestUsage(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this harvest usage entry?")) return;
    try {
      await harvestApi.deleteHarvestUsage(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeletePart(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this part?")) return;
    try {
      await harvestApi.deletePart(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeletePartPurchase(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this part purchase?")) return;
    try {
      await harvestApi.deletePartPurchase(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeletePartUsage(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this part usage entry?")) return;
    try {
      await harvestApi.deletePartUsage(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteExpense(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this expense?")) return;
    try {
      await harvestApi.deleteExpense(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDeleteIncome(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm("Delete this income entry?")) return;
    try {
      await harvestApi.deleteIncome(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const totalPartsCost = partPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalNutrientCost = rawPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalIncome = income.reduce((sum, i) => sum + i.total, 0);
  const netProfit = totalIncome - totalPartsCost - totalNutrientCost - totalExpenses;

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Harvest
          </div>
          <h1 className="serif text-4xl lg:text-5xl">Harvest Tracking</h1>
        </div>
        <div className="flex items-end gap-3">
          <div className="min-w-[200px]">
            <label className="label">Harvest Name</label>
            <input
              type="text"
              className="input"
              value={harvestName}
              onChange={(e) => setHarvestName(e.target.value)}
            />
          </div>
        </div>
      </div>

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

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        {(["dashboard", "raw", "mixing", "usage", "parts", "expenses", "income"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-3 text-sm font-medium transition"
            style={{
              color: activeTab === tab ? "var(--text)" : "var(--text-dim)",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "none",
              marginBottom: "-1px",
            }}
          >
            {tab === "dashboard" && "Dashboard"}
            {tab === "raw" && "Raw Materials"}
            {tab === "mixing" && "Mixing"}
            {tab === "usage" && "Harvest Usage"}
            {tab === "parts" && "Parts"}
            {tab === "expenses" && "Expenses"}
            {tab === "income" && "Income"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      )}

      {!loading && (
        <>
          {/* DASHBOARD TAB */}
          {activeTab === "dashboard" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="card relative overflow-hidden p-5">
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, #FF6B35, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Parts Cost
                </div>
                <div className="serif mt-2 text-2xl">{fmtIDR(totalPartsCost)}</div>
              </div>

              <div className="card relative overflow-hidden p-5">
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, #4ADE80, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Nutrient Cost
                </div>
                <div className="serif mt-2 text-2xl">{fmtIDR(totalNutrientCost)}</div>
              </div>

              <div className="card relative overflow-hidden p-5">
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, #60A5FA, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Expenses
                </div>
                <div className="serif mt-2 text-2xl">{fmtIDR(totalExpenses)}</div>
              </div>

              <div className="card relative overflow-hidden p-5">
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: "linear-gradient(90deg, transparent, #FFB84D, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Income
                </div>
                <div className="serif mt-2 text-2xl">{fmtIDR(totalIncome)}</div>
              </div>

              <div className="card relative overflow-hidden p-5" style={{ background: netProfit >= 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: 1,
                    background: netProfit >= 0 ? "linear-gradient(90deg, transparent, #4ADE80, transparent)" : "linear-gradient(90deg, transparent, #F87171, transparent)",
                  }}
                />
                <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Net Profit
                </div>
                <div className="serif mt-2 text-2xl" style={{ color: netProfit >= 0 ? "#4ADE80" : "#F87171" }}>
                  {fmtIDR(netProfit)}
                </div>
              </div>
            </div>
          )}

          {/* RAW MATERIALS TAB */}
          {activeTab === "raw" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Raw Materials</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewRaw(true)}>
                    + Add Material
                  </button>
                )}
              </div>

              <div className="card overflow-hidden mb-6">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Name</Th>
                        <Th>Category</Th>
                        <Th>Unit</Th>
                        <Th align="right">Purchased</Th>
                        <Th align="right">Used</Th>
                        <Th align="right">Stock</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawMaterials.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No raw materials
                          </td>
                        </tr>
                      ) : (
                        rawMaterials.map((m) => (
                          <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td>{m.name}</Td>
                            <Td>{m.category}</Td>
                            <Td className="mono text-xs">{m.unit}</Td>
                            <Td align="right" className="mono">{m.total_purchased.toFixed(1)}</Td>
                            <Td align="right" className="mono">{m.total_used.toFixed(1)}</Td>
                            <Td align="right" className="mono font-medium">{m.stock_on_hand.toFixed(1)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingRaw(m)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text)",
                                      borderColor: "var(--border)",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRaw(m.id)}
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
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Raw Purchases</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewRawPurchase(true)}>
                    + Add Purchase
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Material</Th>
                        <Th>Supplier</Th>
                        <Th align="right">Qty</Th>
                        <Th align="right">Cost</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No purchases
                          </td>
                        </tr>
                      ) : (
                        rawPurchases.map((p) => (
                          <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{p.date}</Td>
                            <Td>{p.raw_material_name}</Td>
                            <Td>{p.supplier}</Td>
                            <Td align="right" className="mono">{p.qty.toFixed(1)}</Td>
                            <Td align="right" className="mono font-medium">{fmtIDR(p.total_cost)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteRawPurchase(p.id)}
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
            </div>
          )}

          {/* MIXING TAB */}
          {activeTab === "mixing" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Mixed Nutrients</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewMixed(true)}>
                    + Add Nutrient
                  </button>
                )}
              </div>

              <div className="card overflow-hidden mb-6">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Name</Th>
                        <Th>Crop</Th>
                        <Th>Unit</Th>
                        <Th align="right">Produced</Th>
                        <Th align="right">Used</Th>
                        <Th align="right">Stock</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {mixedNutrients.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No mixed nutrients
                          </td>
                        </tr>
                      ) : (
                        mixedNutrients.map((n) => (
                          <tr key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td>{n.name}</Td>
                            <Td>{n.crop}</Td>
                            <Td className="mono text-xs">{n.unit}</Td>
                            <Td align="right" className="mono">{n.total_produced.toFixed(1)}</Td>
                            <Td align="right" className="mono">{n.total_used.toFixed(1)}</Td>
                            <Td align="right" className="mono font-medium">{n.stock_on_hand.toFixed(1)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingMixed(n)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text)",
                                      borderColor: "var(--border)",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMixed(n.id)}
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
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Mixing Log</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewMixingLog(true)}>
                    + Add Entry
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Batch</Th>
                        <Th>Raw Material</Th>
                        <Th align="right">Qty Used</Th>
                        <Th>Mixed Nutrient</Th>
                        <Th align="right">Qty Produced</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {mixingLog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No mixing log entries
                          </td>
                        </tr>
                      ) : (
                        mixingLog.map((e) => (
                          <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{e.date}</Td>
                            <Td className="mono text-xs">B{e.batch}</Td>
                            <Td>{e.raw_material_name}</Td>
                            <Td align="right" className="mono">{e.qty_used.toFixed(1)}</Td>
                            <Td>{e.mixed_nutrient_name}</Td>
                            <Td align="right" className="mono font-medium">{e.qty_produced.toFixed(1)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteMixingLog(e.id)}
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
            </div>
          )}

          {/* HARVEST USAGE TAB */}
          {activeTab === "usage" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Nutrient Usage</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewHarvestUsage(true)}>
                    + Add Usage
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Mixed Nutrient</Th>
                        <Th align="right">Qty Used</Th>
                        <Th>Harvest</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {harvestUsage.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No usage entries
                          </td>
                        </tr>
                      ) : (
                        harvestUsage.map((u) => (
                          <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{u.date}</Td>
                            <Td>{u.mixed_nutrient_name}</Td>
                            <Td align="right" className="mono">{u.qty_used.toFixed(1)}</Td>
                            <Td>{u.harvest_name}</Td>
                            <Td align="right">
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteHarvestUsage(u.id)}
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
            </div>
          )}

          {/* PARTS TAB */}
          {activeTab === "parts" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Parts Inventory</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewPart(true)}>
                    + Add Part
                  </button>
                )}
              </div>

              <div className="card overflow-hidden mb-6">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Name</Th>
                        <Th>Unit</Th>
                        <Th align="right">Purchased</Th>
                        <Th align="right">Assigned</Th>
                        <Th align="right">On Shelf</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No parts
                          </td>
                        </tr>
                      ) : (
                        parts.map((p) => (
                          <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td>{p.name}</Td>
                            <Td className="mono text-xs">{p.unit}</Td>
                            <Td align="right" className="mono">{p.total_purchased.toFixed(1)}</Td>
                            <Td align="right" className="mono">{p.total_assigned.toFixed(1)}</Td>
                            <Td align="right" className="mono font-medium">{p.on_shelf.toFixed(1)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingPart(p)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text)",
                                      borderColor: "var(--border)",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDeletePart(p.id)}
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
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Part Purchases</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewPartPurchase(true)}>
                    + Add Purchase
                  </button>
                )}
              </div>

              <div className="card overflow-hidden mb-6">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Part</Th>
                        <Th>Supplier</Th>
                        <Th align="right">Qty</Th>
                        <Th align="right">Cost</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {partPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No part purchases
                          </td>
                        </tr>
                      ) : (
                        partPurchases.map((p) => (
                          <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{p.date}</Td>
                            <Td>{p.part_name}</Td>
                            <Td>{p.supplier}</Td>
                            <Td align="right" className="mono">{p.qty.toFixed(1)}</Td>
                            <Td align="right" className="mono font-medium">{fmtIDR(p.total_cost)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <button
                                  onClick={() => handleDeletePartPurchase(p.id)}
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

              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Part Usage</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewPartUsage(true)}>
                    + Add Usage
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Part</Th>
                        <Th align="right">Qty Used</Th>
                        <Th>Harvest</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {partUsage.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No part usage entries
                          </td>
                        </tr>
                      ) : (
                        partUsage.map((u) => (
                          <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{u.date}</Td>
                            <Td>{u.part_name}</Td>
                            <Td align="right" className="mono">{u.qty_used.toFixed(1)}</Td>
                            <Td>{u.harvest_name}</Td>
                            <Td align="right">
                              {isOwner && (
                                <button
                                  onClick={() => handleDeletePartUsage(u.id)}
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
            </div>
          )}

          {/* EXPENSES TAB */}
          {activeTab === "expenses" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Expenses</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewExpense(true)}>
                    + Add Expense
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Category</Th>
                        <Th>Description</Th>
                        <Th align="right">Amount</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No expenses
                          </td>
                        </tr>
                      ) : (
                        expenses.map((e) => (
                          <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{e.date}</Td>
                            <Td>{e.category}</Td>
                            <Td>{e.description}</Td>
                            <Td align="right" className="mono font-medium">{fmtIDR(e.amount)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingExpense(e)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text)",
                                      borderColor: "var(--border)",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDeleteExpense(e.id)}
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
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* INCOME TAB */}
          {activeTab === "income" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="serif text-xl">Income</h3>
                {isOwner && (
                  <button className="btn btn-primary text-sm" onClick={() => setShowNewIncome(true)}>
                    + Add Income
                  </button>
                )}
              </div>

              <div className="card overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Th>Date</Th>
                        <Th>Buyer</Th>
                        <Th align="right">Weight (kg)</Th>
                        <Th align="right">Price/kg</Th>
                        <Th align="right">Total</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {income.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                            No income entries
                          </td>
                        </tr>
                      ) : (
                        income.map((i) => (
                          <tr key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <Td className="mono text-xs">{i.date}</Td>
                            <Td>{i.buyer}</Td>
                            <Td align="right" className="mono">{i.weight_kg.toFixed(1)}</Td>
                            <Td align="right" className="mono">{fmtIDR(i.price_per_kg)}</Td>
                            <Td align="right" className="mono font-medium">{fmtIDR(i.total)}</Td>
                            <Td align="right">
                              {isOwner && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setEditingIncome(i)}
                                    className="rounded-md border px-2 py-1 text-xs"
                                    style={{
                                      background: "rgba(255,255,255,0.04)",
                                      color: "var(--text)",
                                      borderColor: "var(--border)",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    onClick={() => handleDeleteIncome(i.id)}
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
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showNewRaw && (
        <RawMaterialModal
          item={null}
          onClose={() => setShowNewRaw(false)}
          onSaved={() => {
            setShowNewRaw(false);
            refresh();
          }}
        />
      )}

      {editingRaw && (
        <RawMaterialModal
          item={editingRaw}
          onClose={() => setEditingRaw(null)}
          onSaved={() => {
            setEditingRaw(null);
            refresh();
          }}
        />
      )}

      {showNewRawPurchase && (
        <RawPurchaseModal
          item={null}
          rawMaterials={rawMaterials}
          onClose={() => setShowNewRawPurchase(false)}
          onSaved={() => {
            setShowNewRawPurchase(false);
            refresh();
          }}
        />
      )}

      {showNewMixed && (
        <MixedNutrientModal
          item={null}
          onClose={() => setShowNewMixed(false)}
          onSaved={() => {
            setShowNewMixed(false);
            refresh();
          }}
        />
      )}

      {editingMixed && (
        <MixedNutrientModal
          item={editingMixed}
          onClose={() => setEditingMixed(null)}
          onSaved={() => {
            setEditingMixed(null);
            refresh();
          }}
        />
      )}

      {showNewMixingLog && (
        <MixingLogModal
          rawMaterials={rawMaterials}
          mixedNutrients={mixedNutrients}
          onClose={() => setShowNewMixingLog(false)}
          onSaved={() => {
            setShowNewMixingLog(false);
            refresh();
          }}
        />
      )}

      {showNewHarvestUsage && (
        <HarvestUsageModal
          mixedNutrients={mixedNutrients}
          defaultHarvest={harvestName}
          onClose={() => setShowNewHarvestUsage(false)}
          onSaved={() => {
            setShowNewHarvestUsage(false);
            refresh();
          }}
        />
      )}

      {showNewPart && (
        <PartModal
          item={null}
          onClose={() => setShowNewPart(false)}
          onSaved={() => {
            setShowNewPart(false);
            refresh();
          }}
        />
      )}

      {editingPart && (
        <PartModal
          item={editingPart}
          onClose={() => setEditingPart(null)}
          onSaved={() => {
            setEditingPart(null);
            refresh();
          }}
        />
      )}

      {showNewPartPurchase && (
        <PartPurchaseModal
          parts={parts}
          onClose={() => setShowNewPartPurchase(false)}
          onSaved={() => {
            setShowNewPartPurchase(false);
            refresh();
          }}
        />
      )}

      {showNewPartUsage && (
        <PartUsageModal
          parts={parts}
          defaultHarvest={harvestName}
          onClose={() => setShowNewPartUsage(false)}
          onSaved={() => {
            setShowNewPartUsage(false);
            refresh();
          }}
        />
      )}

      {showNewExpense && (
        <ExpenseModal
          item={null}
          defaultHarvest={harvestName}
          onClose={() => setShowNewExpense(false)}
          onSaved={() => {
            setShowNewExpense(false);
            refresh();
          }}
        />
      )}

      {editingExpense && (
        <ExpenseModal
          item={editingExpense}
          defaultHarvest={harvestName}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            refresh();
          }}
        />
      )}

      {showNewIncome && (
        <IncomeModal
          item={null}
          defaultHarvest={harvestName}
          onClose={() => setShowNewIncome(false)}
          onSaved={() => {
            setShowNewIncome(false);
            refresh();
          }}
        />
      )}

      {editingIncome && (
        <IncomeModal
          item={editingIncome}
          defaultHarvest={harvestName}
          onClose={() => setEditingIncome(null)}
          onSaved={() => {
            setEditingIncome(null);
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

function Td({ children, align, className = "" }: { children?: React.ReactNode; align?: "right" | "left"; className?: string }) {
  return (
    <td
      className={className}
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

// MODALS

function RawMaterialModal({ item, onClose, onSaved }: { item: RawMaterial | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await harvestApi.updateRawMaterial(item.id, { name, unit, category, notes });
      } else {
        await harvestApi.createRawMaterial({ name, unit, category, notes });
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
          {item ? "Edit" : "New"}
        </div>
        <h2 className="serif mb-6 text-3xl">Raw Material</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit</label>
              <input
                type="text"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Category</label>
              <input
                type="text"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {err && (
            <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RawPurchaseModal({ item, rawMaterials, onClose, onSaved }: { item: RawPurchase | null; rawMaterials: RawMaterial[]; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(item?.date ?? today);
  const [materialId, setMaterialId] = useState(item?.raw_material_id.toString() ?? "");
  const [supplier, setSupplier] = useState(item?.supplier ?? "");
  const [qty, setQty] = useState(item?.qty.toString() ?? "");
  const [cost, setCost] = useState(item?.total_cost.toString() ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await harvestApi.createRawPurchase({
        raw_material_id: parseInt(materialId),
        date,
        supplier,
        qty: parseFloat(qty),
        total_cost: parseFloat(cost),
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
          New Purchase
        </div>
        <h2 className="serif mb-6 text-3xl">Raw Material</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Material</label>
              <select
                className="input"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                required
              >
                <option value="">Select</option>
                {rawMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Supplier</label>
            <input
              type="text"
              className="input"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qty</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Cost</label>
              <input
                type="number"
                className="input"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MixedNutrientModal({ item, onClose, onSaved }: { item: MixedNutrient | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [crop, setCrop] = useState(item?.crop ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await harvestApi.updateMixedNutrient(item.id, { name, unit, crop, notes });
      } else {
        await harvestApi.createMixedNutrient({ name, unit, crop, notes });
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
          {item ? "Edit" : "New"}
        </div>
        <h2 className="serif mb-6 text-3xl">Mixed Nutrient</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit</label>
              <input
                type="text"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Crop</label>
              <input
                type="text"
                className="input"
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {err && (
            <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MixingLogModal({ rawMaterials, mixedNutrients, onClose, onSaved }: { rawMaterials: RawMaterial[]; mixedNutrients: MixedNutrient[]; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [batch, setBatch] = useState("1");
  const [materialId, setMaterialId] = useState("");
  const [qtyUsed, setQtyUsed] = useState("");
  const [nutrientId, setNutrientId] = useState("");
  const [qtyProduced, setQtyProduced] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await harvestApi.createMixingLog({
        batch: parseInt(batch),
        date,
        raw_material_id: parseInt(materialId),
        qty_used: parseFloat(qtyUsed),
        mixed_nutrient_id: parseInt(nutrientId),
        qty_produced: parseFloat(qtyProduced),
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
          New Entry
        </div>
        <h2 className="serif mb-6 text-3xl">Mixing Log</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Batch</label>
              <input
                type="number"
                className="input"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Raw Material</label>
            <select
              className="input"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              required
            >
              <option value="">Select</option>
              {rawMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="label">Qty Used</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={qtyUsed}
              onChange={(e) => setQtyUsed(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="label">Mixed Nutrient</label>
            <select
              className="input"
              value={nutrientId}
              onChange={(e) => setNutrientId(e.target.value)}
              required
            >
              <option value="">Select</option>
              {mixedNutrients.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="label">Qty Produced</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={qtyProduced}
              onChange={(e) => setQtyProduced(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HarvestUsageModal({ mixedNutrients, defaultHarvest, onClose, onSaved }: { mixedNutrients: MixedNutrient[]; defaultHarvest: string; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [nutrientId, setNutrientId] = useState("");
  const [qtyUsed, setQtyUsed] = useState("");
  const [harvest, setHarvest] = useState(defaultHarvest);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await harvestApi.createHarvestUsage({
        date,
        mixed_nutrient_id: parseInt(nutrientId),
        qty_used: parseFloat(qtyUsed),
        harvest_name: harvest,
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
          New Usage
        </div>
        <h2 className="serif mb-6 text-3xl">Harvest Usage</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Harvest</label>
              <input
                type="text"
                className="input"
                value={harvest}
                onChange={(e) => setHarvest(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Mixed Nutrient</label>
            <select
              className="input"
              value={nutrientId}
              onChange={(e) => setNutrientId(e.target.value)}
              required
            >
              <option value="">Select</option>
              {mixedNutrients.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="label">Qty Used</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={qtyUsed}
              onChange={(e) => setQtyUsed(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartModal({ item, onClose, onSaved }: { item: Part | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [link, setLink] = useState(item?.link ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await harvestApi.updatePart(item.id, { name, unit, link, notes });
      } else {
        await harvestApi.createPart({ name, unit, link, notes });
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
          {item ? "Edit" : "New"}
        </div>
        <h2 className="serif mb-6 text-3xl">Part</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit</label>
              <input
                type="text"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Link</label>
            <input
              type="url"
              className="input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          {err && (
            <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartPurchaseModal({ parts, onClose, onSaved }: { parts: Part[]; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [partId, setPartId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await harvestApi.createPartPurchase({
        part_id: parseInt(partId),
        date,
        supplier,
        qty: parseFloat(qty),
        total_cost: parseFloat(cost),
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
          New Purchase
        </div>
        <h2 className="serif mb-6 text-3xl">Part</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Part</label>
              <select
                className="input"
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                required
              >
                <option value="">Select</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Supplier</label>
            <input
              type="text"
              className="input"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qty</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Cost</label>
              <input
                type="number"
                className="input"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartUsageModal({ parts, defaultHarvest, onClose, onSaved }: { parts: Part[]; defaultHarvest: string; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [partId, setPartId] = useState("");
  const [qtyUsed, setQtyUsed] = useState("");
  const [harvest, setHarvest] = useState(defaultHarvest);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await harvestApi.createPartUsage({
        date,
        part_id: parseInt(partId),
        qty_used: parseFloat(qtyUsed),
        harvest_name: harvest,
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
          New Usage
        </div>
        <h2 className="serif mb-6 text-3xl">Part Usage</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Harvest</label>
              <input
                type="text"
                className="input"
                value={harvest}
                onChange={(e) => setHarvest(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Part</label>
            <select
              className="input"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              required
            >
              <option value="">Select</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="label">Qty Used</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={qtyUsed}
              onChange={(e) => setQtyUsed(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExpenseModal({ item, defaultHarvest, onClose, onSaved }: { item: HarvestExpense | null; defaultHarvest: string; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(item?.date ?? today);
  const [harvest, setHarvest] = useState(item?.harvest_name ?? defaultHarvest);
  const [category, setCategory] = useState(item?.category ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item?.amount.toString() ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await harvestApi.updateExpense(item.id, { date, harvest_name: harvest, category, description, amount: parseFloat(amount), notes });
      } else {
        await harvestApi.createExpense({ date, harvest_name: harvest, category, description, amount: parseFloat(amount), notes });
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
          {item ? "Edit" : "New"}
        </div>
        <h2 className="serif mb-6 text-3xl">Expense</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Harvest</label>
              <input
                type="text"
                className="input"
                value={harvest}
                onChange={(e) => setHarvest(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Category</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">Select</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="label">Description</label>
            <input
              type="text"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="mb-6">
            <label className="label">Amount</label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncomeModal({ item, defaultHarvest, onClose, onSaved }: { item: HarvestIncome | null; defaultHarvest: string; onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(item?.date ?? today);
  const [harvest, setHarvest] = useState(item?.harvest_name ?? defaultHarvest);
  const [buyer, setBuyer] = useState(item?.buyer ?? "");
  const [weight, setWeight] = useState(item?.weight_kg.toString() ?? "");
  const [price, setPrice] = useState(item?.price_per_kg.toString() ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await harvestApi.updateIncome(item.id, {
          date,
          harvest_name: harvest,
          buyer,
          weight_kg: parseFloat(weight),
          price_per_kg: parseFloat(price),
          notes,
        });
      } else {
        await harvestApi.createIncome({
          date,
          harvest_name: harvest,
          buyer,
          weight_kg: parseFloat(weight),
          price_per_kg: parseFloat(price),
          notes,
        });
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
          {item ? "Edit" : "New"}
        </div>
        <h2 className="serif mb-6 text-3xl">Income</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Harvest</label>
              <input
                type="text"
                className="input"
                value={harvest}
                onChange={(e) => setHarvest(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Buyer</label>
            <input
              type="text"
              className="input"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              required
            />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Weight (kg)</label>
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
              <label className="label">Price/kg</label>
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
