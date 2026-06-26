"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Copy,
  Eraser,
  Folder,
  Leaf,
  Plus,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";

/** Top-level types. */
export type ItemOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  subUnit: string | null;
  subFactor: number | null;
  /** Most-recent unit price (per `unit`). 0 means we don't know — user
   *  fills in manually. */
  lastUnitPrice: number;
};
export type ProduceOption = { id: string; name: string };
export type StaffOption = {
  id: string;
  name: string;
  defaultHourlyRate: number;
};

type ItemLine = {
  id: string;
  itemId: string | null;
  /** Free-text label when the user doesn't pick a real item. */
  customLabel: string;
  qty: string;
  unitPrice: string;
};
type LabourLine = {
  id: string;
  staffId: string | null;
  customLabel: string;
  task: string;
  hours: string;
  hourlyRate: string;
};
type AssetLine = {
  id: string;
  itemId: string | null;
  customLabel: string;
  qty: string;
  costPerUse: string;
  usesThisCycle: string;
};
type OtherLine = {
  id: string;
  description: string;
  amount: string;
};

type Scenario = {
  /** Display name shown in the saved-scenarios list. */
  name: string;
  greenhouse: string;
  produceId: string | null;
  produceCustom: string;
  cycleDays: string;
  yieldKg: string;
  pricePerKg: string;
  items: ItemLine[];
  labour: LabourLine[];
  assets: AssetLine[];
  other: OtherLine[];
  /** ISO timestamp when this scenario was last saved. */
  savedAt: string;
};

const STORAGE_KEY = "sparmanik-farm:simulator:v1";

function makeId(): string {
  // Bigger-than-Math.random nonsense so duplicates across tab reopens
  // don't collide. Doesn't need to be cryptographic — just unique-ish
  // within the local scenario set.
  return `${Date.now().toString(36)}-${performance.now().toString(36).replace(/\./g, "")}`;
}

const emptyScenario = (): Scenario => ({
  name: "New scenario",
  greenhouse: "",
  produceId: null,
  produceCustom: "",
  cycleDays: "90",
  yieldKg: "0",
  pricePerKg: "0",
  items: [
    {
      id: makeId(),
      itemId: null,
      customLabel: "",
      qty: "0",
      unitPrice: "0",
    },
  ],
  labour: [
    {
      id: makeId(),
      staffId: null,
      customLabel: "",
      task: "",
      hours: "0",
      hourlyRate: "0",
    },
  ],
  assets: [],
  other: [],
  savedAt: "",
});

function loadStore(): Record<string, Scenario> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, Scenario>;
  } catch {}
  return {};
}
function saveStore(store: Record<string, Scenario>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    // Most likely quota — surface to the user so they're not silently
    // losing scenarios.
    toast.error(
      err instanceof Error
        ? `Couldn't save: ${err.message}`
        : "Couldn't save scenario to browser storage",
    );
  }
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Sandbox P&L calculator. No DB writes, no stock consumption — purely
 * a "what-if" tool for testing whether a future greenhouse cycle would
 * be profitable before committing to it.
 */
export function SimulatorClient({
  itemOptions,
  produceOptions,
  staffOptions,
}: {
  itemOptions: ItemOption[];
  produceOptions: ProduceOption[];
  staffOptions: StaffOption[];
  exchangeRate: number;
}) {
  const [store, setStore] = useState<Record<string, Scenario>>({});
  const [scenarioKey, setScenarioKey] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>(emptyScenario);

  // Restore the saved-scenario index on first paint. Doing this in an
  // effect (rather than at useState init time) keeps the SSR pass and
  // the first client render in agreement. The queueMicrotask dodge
  // satisfies React 19's set-state-in-effect lint rule — same pattern
  // we use in ask-ai/chat-panel.tsx (see CLAUDE.md gotcha #17 sibling).
  useEffect(() => {
    queueMicrotask(() => setStore(loadStore()));
  }, []);

  const scenarioKeys = useMemo(() => Object.keys(store).sort(), [store]);

  // ---- derived: live P&L --------------------------------------------------

  const itemCost = scenario.items.reduce(
    (s, l) => s + num(l.qty) * num(l.unitPrice),
    0,
  );
  const labourCost = scenario.labour.reduce(
    (s, l) => s + num(l.hours) * num(l.hourlyRate),
    0,
  );
  const assetCost = scenario.assets.reduce(
    (s, l) => s + num(l.qty) * num(l.costPerUse) * num(l.usesThisCycle),
    0,
  );
  const otherCost = scenario.other.reduce((s, l) => s + num(l.amount), 0);
  const totalCost = itemCost + labourCost + assetCost + otherCost;
  const revenue = num(scenario.yieldKg) * num(scenario.pricePerKg);
  const net = revenue - totalCost;
  const margin = revenue > 0 ? net / revenue : 0;
  const breakEvenPrice = num(scenario.yieldKg) > 0 ? totalCost / num(scenario.yieldKg) : 0;

  // ---- handlers -----------------------------------------------------------

  function updateScenario(patch: Partial<Scenario>) {
    setScenario((prev) => ({ ...prev, ...patch }));
  }

  function newScenario() {
    setScenarioKey(null);
    setScenario(emptyScenario());
  }

  function loadScenario(key: string) {
    const s = store[key];
    if (!s) return;
    setScenarioKey(key);
    setScenario({ ...s });
  }

  function saveScenario() {
    const name = scenario.name?.trim() || "Untitled scenario";
    const key = scenarioKey ?? `${name}-${makeId()}`;
    const next: Scenario = { ...scenario, name, savedAt: new Date().toISOString() };
    const nextStore = { ...store, [key]: next };
    setStore(nextStore);
    saveStore(nextStore);
    setScenarioKey(key);
    toast.success(`Saved "${name}"`);
  }

  function duplicateScenario() {
    const name = `${scenario.name} (copy)`;
    setScenarioKey(null);
    setScenario({ ...scenario, name, savedAt: "" });
    toast.success(`Duplicated — remember to Save the copy`);
  }

  function deleteScenario(key: string) {
    if (!window.confirm(`Delete scenario "${store[key]?.name ?? key}"?`)) return;
    const nextStore = { ...store };
    delete nextStore[key];
    setStore(nextStore);
    saveStore(nextStore);
    if (scenarioKey === key) newScenario();
    toast.success("Deleted");
  }

  function resetCurrent() {
    if (!window.confirm("Clear all fields on the current scenario?")) return;
    setScenarioKey(null);
    setScenario(emptyScenario());
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Farm simulator</h1>
          <p className="text-sm text-muted-foreground">
            Test &ldquo;what if&rdquo; greenhouse cycles. <strong>No real stock is
            consumed</strong> &mdash; this is a pure P&amp;L calculator. Save
            scenarios to your browser to compare later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={newScenario}>
            <Plus className="h-3.5 w-3.5" /> New scenario
          </Button>
          <Button variant="outline" size="sm" onClick={duplicateScenario}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={resetCurrent}>
            <Eraser className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={saveScenario}>
            <Save className="h-3.5 w-3.5" /> Save scenario
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Saved-scenarios sidebar */}
        <Card className="self-start">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Folder className="h-3.5 w-3.5" /> Saved scenarios
            </div>
            {scenarioKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved scenarios yet. Build one on the right and hit
                Save.
              </p>
            ) : (
              <ul className="space-y-1">
                {scenarioKeys.map((k) => {
                  const s = store[k];
                  const active = k === scenarioKey;
                  return (
                    <li
                      key={k}
                      className={cn(
                        "group flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "border-accent bg-accent/10"
                          : "border-transparent hover:border-border hover:bg-muted/40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => loadScenario(k)}
                        className="flex-1 truncate text-left"
                        title={s.name}
                      >
                        <span className="block truncate font-medium">
                          {s.name}
                        </span>
                        {s.savedAt ? (
                          <span className="block text-[10px] text-muted-foreground">
                            {new Date(s.savedAt).toLocaleDateString()}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteScenario(k)}
                        className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        title="Delete scenario"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Main editor + P&L */}
        <div className="space-y-4">
          {/* Top: scenario meta + revenue */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Scenario name</Label>
                  <Input
                    value={scenario.name}
                    onChange={(e) => updateScenario({ name: e.target.value })}
                    placeholder="Test 1 — bigger cycle, premium price"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Greenhouse (label only)</Label>
                  <Input
                    value={scenario.greenhouse}
                    onChange={(e) => updateScenario({ greenhouse: e.target.value })}
                    placeholder="GH-3 (proposed)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Produce</Label>
                  <Combobox
                    value={scenario.produceId}
                    onChange={(v) => updateScenario({ produceId: v })}
                    placeholder="Pick or pick none"
                    options={produceOptions.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Or type</Label>
                  <Input
                    value={scenario.produceCustom}
                    onChange={(e) => updateScenario({ produceCustom: e.target.value })}
                    placeholder="(if not in catalog)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cycle length (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={scenario.cycleDays}
                    onChange={(e) => updateScenario({ cycleDays: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Yield (kg)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={scenario.yieldKg}
                    onChange={(e) => updateScenario({ yieldKg: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Sale price per kg (Rp)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={scenario.pricePerKg}
                    onChange={(e) => updateScenario({ pricePerKg: e.target.value })}
                  />
                </div>
                <div className="flex flex-col justify-end gap-0.5 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Projected revenue</span>
                    <strong className="text-foreground">{fmtMoney(revenue)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Break-even price/kg</span>
                    <span>{breakEvenPrice > 0 ? fmtMoney(breakEvenPrice) : "—"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <ScenarioSection
            title="Items consumed (seeds, nutrients, pots…)"
            description="Stuff you USE UP during the cycle. Each row: pick from your real catalog (price pre-fills from last paid) or type a free-text label. Qty × Rp/unit = row cost. Adds to the cycle's expenses but does NOT consume real stock — pure scenario math."
            icon={<Leaf className="h-3.5 w-3.5" />}
            subtotal={itemCost}
            onAdd={() =>
              updateScenario({
                items: [
                  ...scenario.items,
                  {
                    id: makeId(),
                    itemId: null,
                    customLabel: "",
                    qty: "0",
                    unitPrice: "0",
                  },
                ],
              })
            }
          >
            {scenario.items.map((row, idx) => {
              const it = itemOptions.find((i) => i.id === row.itemId);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-1 gap-2 rounded-md border bg-background/40 p-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <div className="space-y-0.5">
                    <Combobox
                      value={row.itemId}
                      onChange={(v) => {
                        const next = [...scenario.items];
                        next[idx] = { ...row, itemId: v };
                        // Pre-fill unit price from the most-recent batch
                        // if we know it and the user hasn't typed one.
                        if (v) {
                          const found = itemOptions.find((i) => i.id === v);
                          if (
                            found?.lastUnitPrice &&
                            (row.unitPrice === "" || row.unitPrice === "0")
                          ) {
                            next[idx].unitPrice = String(found.lastUnitPrice);
                          }
                        }
                        updateScenario({ items: next });
                      }}
                      placeholder="Pick item from catalog (or leave blank)"
                      options={itemOptions.map((i) => ({
                        value: i.id,
                        label: i.name,
                        description: `${i.code} · ${i.unit}${i.lastUnitPrice ? ` · last paid ${fmtMoney(i.lastUnitPrice)}` : ""}`,
                      }))}
                    />
                    {!row.itemId ? (
                      <Input
                        value={row.customLabel}
                        onChange={(e) => {
                          const next = [...scenario.items];
                          next[idx] = { ...row, customLabel: e.target.value };
                          updateScenario({ items: next });
                        }}
                        placeholder="Or type a label (e.g. 'extra fertiliser')"
                        className="h-8"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Qty
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={row.qty}
                      onChange={(e) => {
                        const next = [...scenario.items];
                        next[idx] = { ...row, qty: e.target.value };
                        updateScenario({ items: next });
                      }}
                      placeholder={`e.g. 10 ${it?.unit ?? "units"}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Rp / unit
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={row.unitPrice}
                      onChange={(e) => {
                        const next = [...scenario.items];
                        next[idx] = { ...row, unitPrice: e.target.value };
                        updateScenario({ items: next });
                      }}
                      placeholder="e.g. 5000"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const next = scenario.items.filter((_, i) => i !== idx);
                      updateScenario({ items: next.length ? next : scenario.items });
                    }}
                    title="Remove line"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </ScenarioSection>

          {/* Labour */}
          <ScenarioSection
            title="Labour"
            description="Estimated wages for this cycle. Each row: pick a staff member (their hourly rate pre-fills) or leave blank and type one manually. Hours × Rp/hour = row cost. Use one row per task or just one summed row — whatever's easiest."
            icon={<Calculator className="h-3.5 w-3.5" />}
            subtotal={labourCost}
            onAdd={() =>
              updateScenario({
                labour: [
                  ...scenario.labour,
                  {
                    id: makeId(),
                    staffId: null,
                    customLabel: "",
                    task: "",
                    hours: "0",
                    hourlyRate: "0",
                  },
                ],
              })
            }
          >
            {scenario.labour.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-2 rounded-md border bg-background/40 p-2 sm:grid-cols-[1.5fr_1.5fr_1fr_1fr_auto]"
              >
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Staff
                  </Label>
                  <Combobox
                    value={row.staffId}
                    onChange={(v) => {
                      const next = [...scenario.labour];
                      next[idx] = { ...row, staffId: v };
                      if (v) {
                        const found = staffOptions.find((s) => s.id === v);
                        if (
                          found?.defaultHourlyRate &&
                          (row.hourlyRate === "" || row.hourlyRate === "0")
                        ) {
                          next[idx].hourlyRate = String(found.defaultHourlyRate);
                        }
                      }
                      updateScenario({ labour: next });
                    }}
                    placeholder="Pick from staff (or blank)"
                    options={staffOptions.map((s) => ({
                      value: s.id,
                      label: s.name,
                      description: s.defaultHourlyRate
                        ? `${fmtMoney(s.defaultHourlyRate)}/hr`
                        : "",
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Task description
                  </Label>
                  <Input
                    value={row.task}
                    onChange={(e) => {
                      const next = [...scenario.labour];
                      next[idx] = { ...row, task: e.target.value };
                      updateScenario({ labour: next });
                    }}
                    placeholder="e.g. transplanting"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Hours
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.hours}
                    onChange={(e) => {
                      const next = [...scenario.labour];
                      next[idx] = { ...row, hours: e.target.value };
                      updateScenario({ labour: next });
                    }}
                    placeholder="e.g. 6"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rp / hour
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.hourlyRate}
                    onChange={(e) => {
                      const next = [...scenario.labour];
                      next[idx] = { ...row, hourlyRate: e.target.value };
                      updateScenario({ labour: next });
                    }}
                    placeholder="e.g. 18000"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const next = scenario.labour.filter((_, i) => i !== idx);
                    updateScenario({ labour: next.length ? next : scenario.labour });
                  }}
                  title="Remove line"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </ScenarioSection>

          {/* Depreciable assets — optional, hidden behind an Add button so
              the form doesn't feel busy when not relevant. */}
          <ScenarioSection
            title="Depreciable assets (rockwool, cocopeat, grow bags…)"
            description="Stuff that gets re-used across multiple cycles but loses life with each use. Qty × Rp per use × number of uses this cycle = row cost. Skip this section if nothing in your scenario is reusable."
            icon={<Calculator className="h-3.5 w-3.5" />}
            subtotal={assetCost}
            onAdd={() =>
              updateScenario({
                assets: [
                  ...scenario.assets,
                  {
                    id: makeId(),
                    itemId: null,
                    customLabel: "",
                    qty: "0",
                    costPerUse: "0",
                    usesThisCycle: "1",
                  },
                ],
              })
            }
          >
            {scenario.assets.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No depreciable assets in this scenario. Add a row if e.g.
                a rockwool roll gets used for multiple cycles and you want
                to charge a per-cycle share.
              </p>
            ) : null}
            {scenario.assets.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-2 rounded-md border bg-background/40 p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <Combobox
                  value={row.itemId}
                  onChange={(v) => {
                    const next = [...scenario.assets];
                    next[idx] = { ...row, itemId: v };
                    updateScenario({ assets: next });
                  }}
                  placeholder="Asset (rockwool, cocopeat…)"
                  options={itemOptions
                    .filter((i) => /rockwool|cocopeat|grow bag|tray|pot/i.test(i.name))
                    .map((i) => ({
                      value: i.id,
                      label: i.name,
                      description: `${i.code} · ${i.unit}`,
                    }))}
                />
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.qty}
                  onChange={(e) => {
                    const next = [...scenario.assets];
                    next[idx] = { ...row, qty: e.target.value };
                    updateScenario({ assets: next });
                  }}
                  placeholder="qty"
                />
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.costPerUse}
                  onChange={(e) => {
                    const next = [...scenario.assets];
                    next[idx] = { ...row, costPerUse: e.target.value };
                    updateScenario({ assets: next });
                  }}
                  placeholder="Rp / use"
                  title="Cost per use"
                />
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.usesThisCycle}
                  onChange={(e) => {
                    const next = [...scenario.assets];
                    next[idx] = { ...row, usesThisCycle: e.target.value };
                    updateScenario({ assets: next });
                  }}
                  placeholder="uses this cycle"
                  title="Uses this cycle"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const next = scenario.assets.filter((_, i) => i !== idx);
                    updateScenario({ assets: next });
                  }}
                  title="Remove line"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </ScenarioSection>

          {/* Other costs — free-text rows for utilities, contractors,
              etc. that don't fit the other buckets. */}
          <ScenarioSection
            title="Other costs (utilities, contractors, fuel…)"
            description="Anything that doesn't fit the buckets above — water, electricity, paid contractor for one task, fuel, transport. Just a description + amount per row."
            icon={<Calculator className="h-3.5 w-3.5" />}
            subtotal={otherCost}
            onAdd={() =>
              updateScenario({
                other: [
                  ...scenario.other,
                  { id: makeId(), description: "", amount: "0" },
                ],
              })
            }
          >
            {scenario.other.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No other costs yet.
              </p>
            ) : null}
            {scenario.other.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-2 rounded-md border bg-background/40 p-2 sm:grid-cols-[3fr_1fr_auto]"
              >
                <Input
                  value={row.description}
                  onChange={(e) => {
                    const next = [...scenario.other];
                    next[idx] = { ...row, description: e.target.value };
                    updateScenario({ other: next });
                  }}
                  placeholder="Description"
                />
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.amount}
                  onChange={(e) => {
                    const next = [...scenario.other];
                    next[idx] = { ...row, amount: e.target.value };
                    updateScenario({ other: next });
                  }}
                  placeholder="Rp amount"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const next = scenario.other.filter((_, i) => i !== idx);
                    updateScenario({ other: next });
                  }}
                  title="Remove line"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </ScenarioSection>

          {/* Bottom-line P&L panel — sticky on desktop so it's visible
              while editing further up the form. */}
          <Card
            className={cn(
              "sticky bottom-0 z-10 border-2 backdrop-blur",
              net >= 0
                ? "border-emerald-500/40 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/40"
                : "border-rose-500/40 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-950/40",
            )}
          >
            <CardContent className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-6">
              <Stat label="Revenue" value={fmtMoney(revenue)} tint="green" />
              <Stat label="Item cost" value={fmtMoney(itemCost)} />
              <Stat label="Labour cost" value={fmtMoney(labourCost)} />
              <Stat label="Asset cost" value={fmtMoney(assetCost)} />
              <Stat label="Other cost" value={fmtMoney(otherCost)} />
              <div className="col-span-2 flex flex-col items-end justify-center rounded-md border bg-background p-2 lg:col-span-1">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {net >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-rose-600" />
                  )}
                  Net
                </div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    net >= 0 ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {fmtMoney(net)}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    net >= 0
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-700",
                  )}
                >
                  margin {fmtPct(margin)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ScenarioSection({
  title,
  description,
  subtotal,
  onAdd,
  icon,
  children,
}: {
  title: string;
  /** One-line explanation rendered under the title so the user knows what
   *  this bucket is for without having to guess from the field labels. */
  description?: string;
  subtotal: number;
  onAdd: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {icon} {title}
            </div>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-1 text-xs">
              Subtotal: <strong>{fmtMoney(subtotal)}</strong>
            </span>
            <Button type="button" size="sm" variant="outline" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
        <div className="space-y-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "green";
}) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold",
          tint === "green" ? "text-emerald-700" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
