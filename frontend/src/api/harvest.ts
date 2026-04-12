const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const ACCESS_KEY = "sparmanik_access_token";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(ACCESS_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const d = await res.json();
      msg = d.detail ?? msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  category: string;
  notes: string;
  total_purchased: number;
  total_used: number;
  stock_on_hand: number;
}

export interface RawPurchase {
  id: number;
  raw_material_id: number;
  raw_material_name: string;
  date: string;
  supplier: string;
  qty: number;
  total_cost: number;
  notes: string;
}

export interface MixedNutrient {
  id: number;
  name: string;
  unit: string;
  crop: string;
  notes: string;
  total_produced: number;
  total_used: number;
  stock_on_hand: number;
}

export interface MixingLogEntry {
  id: number;
  batch: number;
  date: string;
  raw_material_id: number;
  raw_material_name: string;
  qty_used: number;
  mixed_nutrient_id: number;
  mixed_nutrient_name: string;
  qty_produced: number;
  notes: string;
}

export interface HarvestUsageEntry {
  id: number;
  date: string;
  mixed_nutrient_id: number;
  mixed_nutrient_name: string;
  qty_used: number;
  harvest_name: string;
  notes: string;
}

export interface Part {
  id: number;
  name: string;
  unit: string;
  link: string;
  notes: string;
  total_purchased: number;
  total_assigned: number;
  on_shelf: number;
}

export interface PartPurchase {
  id: number;
  part_id: number;
  part_name: string;
  date: string;
  supplier: string;
  qty: number;
  total_cost: number;
  notes: string;
}

export interface PartUsageEntry {
  id: number;
  date: string;
  part_id: number;
  part_name: string;
  qty_used: number;
  harvest_name: string;
  notes: string;
}

export interface HarvestExpense {
  id: number;
  date: string;
  harvest_name: string;
  category: string;
  description: string;
  amount: number;
  notes: string;
}

export interface HarvestIncome {
  id: number;
  date: string;
  harvest_name: string;
  buyer: string;
  weight_kg: number;
  price_per_kg: number;
  total: number;
  notes: string;
}

export interface HarvestSummary {
  total_parts_cost: number;
  total_nutrient_cost: number;
  total_expenses: number;
  total_income: number;
  net_profit: number;
}

export const harvestApi = {
  // Raw Materials
  listRawMaterials() {
    return fetch(`${API_BASE}/api/harvest/raw-materials`, {
      headers: authHeaders(),
    }).then((r) => json<RawMaterial[]>(r));
  },
  createRawMaterial(payload: { name: string; unit: string; category: string; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/raw-materials`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<RawMaterial>(r));
  },
  updateRawMaterial(id: number, payload: Partial<{ name: string; unit: string; category: string; notes: string }>) {
    return fetch(`${API_BASE}/api/harvest/raw-materials/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<RawMaterial>(r));
  },
  deleteRawMaterial(id: number) {
    return fetch(`${API_BASE}/api/harvest/raw-materials/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Raw Purchases
  listRawPurchases() {
    return fetch(`${API_BASE}/api/harvest/raw-purchases`, {
      headers: authHeaders(),
    }).then((r) => json<RawPurchase[]>(r));
  },
  createRawPurchase(payload: { raw_material_id: number; date: string; supplier: string; qty: number; total_cost: number; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/raw-purchases`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<RawPurchase>(r));
  },
  deleteRawPurchase(id: number) {
    return fetch(`${API_BASE}/api/harvest/raw-purchases/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Mixed Nutrients
  listMixedNutrients() {
    return fetch(`${API_BASE}/api/harvest/mixed-nutrients`, {
      headers: authHeaders(),
    }).then((r) => json<MixedNutrient[]>(r));
  },
  createMixedNutrient(payload: { name: string; unit: string; crop: string; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/mixed-nutrients`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<MixedNutrient>(r));
  },
  updateMixedNutrient(id: number, payload: Partial<{ name: string; unit: string; crop: string; notes: string }>) {
    return fetch(`${API_BASE}/api/harvest/mixed-nutrients/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<MixedNutrient>(r));
  },
  deleteMixedNutrient(id: number) {
    return fetch(`${API_BASE}/api/harvest/mixed-nutrients/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Mixing Log
  listMixingLog() {
    return fetch(`${API_BASE}/api/harvest/mixing-log`, {
      headers: authHeaders(),
    }).then((r) => json<MixingLogEntry[]>(r));
  },
  createMixingLog(payload: { batch: number; date: string; raw_material_id: number; qty_used: number; mixed_nutrient_id: number; qty_produced: number; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/mixing-log`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<MixingLogEntry>(r));
  },
  deleteMixingLog(id: number) {
    return fetch(`${API_BASE}/api/harvest/mixing-log/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Harvest Usage
  listHarvestUsage() {
    return fetch(`${API_BASE}/api/harvest/harvest-usage`, {
      headers: authHeaders(),
    }).then((r) => json<HarvestUsageEntry[]>(r));
  },
  createHarvestUsage(payload: { date: string; mixed_nutrient_id: number; qty_used: number; harvest_name: string; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/harvest-usage`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<HarvestUsageEntry>(r));
  },
  deleteHarvestUsage(id: number) {
    return fetch(`${API_BASE}/api/harvest/harvest-usage/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Parts
  listParts() {
    return fetch(`${API_BASE}/api/harvest/parts`, {
      headers: authHeaders(),
    }).then((r) => json<Part[]>(r));
  },
  createPart(payload: { name: string; unit: string; link?: string; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/parts`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Part>(r));
  },
  updatePart(id: number, payload: Partial<{ name: string; unit: string; link: string; notes: string }>) {
    return fetch(`${API_BASE}/api/harvest/parts/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Part>(r));
  },
  deletePart(id: number) {
    return fetch(`${API_BASE}/api/harvest/parts/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Part Purchases
  listPartPurchases() {
    return fetch(`${API_BASE}/api/harvest/part-purchases`, {
      headers: authHeaders(),
    }).then((r) => json<PartPurchase[]>(r));
  },
  createPartPurchase(payload: { part_id: number; date: string; supplier: string; qty: number; total_cost: number; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/part-purchases`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<PartPurchase>(r));
  },
  deletePartPurchase(id: number) {
    return fetch(`${API_BASE}/api/harvest/part-purchases/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Part Usage
  listPartUsage() {
    return fetch(`${API_BASE}/api/harvest/part-usage`, {
      headers: authHeaders(),
    }).then((r) => json<PartUsageEntry[]>(r));
  },
  createPartUsage(payload: { date: string; part_id: number; qty_used: number; harvest_name: string; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/part-usage`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<PartUsageEntry>(r));
  },
  deletePartUsage(id: number) {
    return fetch(`${API_BASE}/api/harvest/part-usage/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Expenses
  listExpenses(harvestName?: string) {
    const qs = new URLSearchParams();
    if (harvestName) qs.set("harvest_name", harvestName);
    const q = qs.toString();
    return fetch(`${API_BASE}/api/harvest/expenses${q ? `?${q}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => json<HarvestExpense[]>(r));
  },
  createExpense(payload: { date: string; harvest_name: string; category: string; description: string; amount: number; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/expenses`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<HarvestExpense>(r));
  },
  updateExpense(id: number, payload: Partial<{ date: string; harvest_name: string; category: string; description: string; amount: number; notes: string }>) {
    return fetch(`${API_BASE}/api/harvest/expenses/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<HarvestExpense>(r));
  },
  deleteExpense(id: number) {
    return fetch(`${API_BASE}/api/harvest/expenses/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Income
  listIncome(harvestName?: string) {
    const qs = new URLSearchParams();
    if (harvestName) qs.set("harvest_name", harvestName);
    const q = qs.toString();
    return fetch(`${API_BASE}/api/harvest/income${q ? `?${q}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => json<HarvestIncome[]>(r));
  },
  createIncome(payload: { date: string; harvest_name: string; buyer: string; weight_kg: number; price_per_kg: number; notes?: string }) {
    return fetch(`${API_BASE}/api/harvest/income`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<HarvestIncome>(r));
  },
  updateIncome(id: number, payload: Partial<{ date: string; harvest_name: string; buyer: string; weight_kg: number; price_per_kg: number; notes: string }>) {
    return fetch(`${API_BASE}/api/harvest/income/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<HarvestIncome>(r));
  },
  deleteIncome(id: number) {
    return fetch(`${API_BASE}/api/harvest/income/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },

  // Summary
  summary(harvestName: string) {
    return fetch(`${API_BASE}/api/harvest/summary?harvest_name=${encodeURIComponent(harvestName)}`, {
      headers: authHeaders(),
    }).then((r) => json<HarvestSummary>(r));
  },
};
