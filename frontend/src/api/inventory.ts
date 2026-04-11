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

export type AdjustReason = "stock_take" | "used" | "wastage" | "received" | "correction";

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  location: string;
  cost_per_unit: number;
  photo_url: string;
  updated_at: string;
  status: "in_stock" | "low" | "out";
}

export interface InventoryStats {
  total_items: number;
  total_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  categories: Record<string, number>;
}

export interface InventoryAdjustment {
  id: number;
  item_id: number;
  user_name: string;
  old_quantity: number;
  new_quantity: number;
  delta: number;
  reason: string;
  note: string;
  created_at: string;
}

export interface ItemCreate {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  location: string;
  cost_per_unit: number;
}

export type ItemUpdate = Partial<ItemCreate>;

export interface AdjustRequest {
  delta?: number;
  new_quantity?: number;
  reason: AdjustReason;
  note?: string;
}

export const inventoryApi = {
  list(params: { category?: string; search?: string; low_stock?: boolean } = {}) {
    const qs = new URLSearchParams();
    if (params.category && params.category !== "all") qs.set("category", params.category);
    if (params.search) qs.set("search", params.search);
    if (params.low_stock) qs.set("low_stock", "true");
    const q = qs.toString();
    return fetch(`${API_BASE}/api/inventory${q ? `?${q}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => json<InventoryItem[]>(r));
  },

  stats() {
    return fetch(`${API_BASE}/api/inventory/stats`, {
      headers: authHeaders(),
    }).then((r) => json<InventoryStats>(r));
  },

  create(payload: ItemCreate) {
    return fetch(`${API_BASE}/api/inventory`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<InventoryItem>(r));
  },

  update(id: number, payload: ItemUpdate) {
    return fetch(`${API_BASE}/api/inventory/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<InventoryItem>(r));
  },

  adjust(id: number, payload: AdjustRequest) {
    return fetch(`${API_BASE}/api/inventory/${id}/adjust`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<InventoryItem>(r));
  },

  setPhoto(id: number, photo_base64: string) {
    return fetch(`${API_BASE}/api/inventory/${id}/photo`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ photo_base64 }),
    }).then((r) => json<InventoryItem>(r));
  },

  adjustments(id: number) {
    return fetch(`${API_BASE}/api/inventory/${id}/adjustments`, {
      headers: authHeaders(),
    }).then((r) => json<InventoryAdjustment[]>(r));
  },

  remove(id: number) {
    return fetch(`${API_BASE}/api/inventory/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
