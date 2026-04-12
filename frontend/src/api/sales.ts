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

export type Species =
  | "chili_red"
  | "chili_keriting"
  | "chili_green"
  | "chili_bigred"
  | "melon_yellow"
  | "melon_rock";
export type Grade = "A" | "B" | "C";

export interface Sale {
  id: number;
  date: string;
  week: number;
  species: string;
  grade: string;
  weight_kg: number;
  price_per_kg: number;
  total: number;
}

export interface WeeklyRollup {
  week: number;
  revenue: number;
  weight_kg: number;
  entry_count: number;
}

export interface SpeciesBreakdown {
  species: string;
  revenue: number;
  weight_kg: number;
}

export interface SalesStats {
  total_revenue: number;
  total_weight_kg: number;
  entry_count: number;
  weekly: WeeklyRollup[];
  by_species: SpeciesBreakdown[];
}

export interface SaleCreate {
  date: string;
  week: number;
  species: string;
  grade: string;
  weight_kg: number;
  price_per_kg: number;
}

export const salesApi = {
  list(params: { species?: string; grade?: string; period?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.species && params.species !== "all") qs.set("species", params.species);
    if (params.grade && params.grade !== "all") qs.set("grade", params.grade);
    if (params.period && params.period !== "all") qs.set("period", params.period);
    const q = qs.toString();
    return fetch(`${API_BASE}/api/sales${q ? `?${q}` : ""}`, {
      headers: authHeaders(),
    }).then((r) => json<Sale[]>(r));
  },
  stats() {
    return fetch(`${API_BASE}/api/sales/stats`, { headers: authHeaders() }).then((r) =>
      json<SalesStats>(r)
    );
  },
  create(payload: SaleCreate) {
    return fetch(`${API_BASE}/api/sales`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Sale>(r));
  },
  update(id: number, payload: Partial<SaleCreate>) {
    return fetch(`${API_BASE}/api/sales/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Sale>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/sales/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
