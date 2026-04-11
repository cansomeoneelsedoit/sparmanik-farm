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

export interface ForecastBudget {
  id: number;
  category: string;
  budgeted: number;
  period: string;
  actual: number;
  variance: number;
  pct: number;
}

export interface ForecastTotals {
  total_budgeted: number;
  total_actual: number;
  over_budget: boolean;
  pct: number;
}

export interface ForecastCreate {
  category: string;
  budgeted: number;
  period: string;
}

export const forecastApi = {
  list() {
    return fetch(`${API_BASE}/api/forecast`, { headers: authHeaders() }).then((r) =>
      json<ForecastBudget[]>(r)
    );
  },
  totals() {
    return fetch(`${API_BASE}/api/forecast/totals`, { headers: authHeaders() }).then((r) =>
      json<ForecastTotals>(r)
    );
  },
  create(payload: ForecastCreate) {
    return fetch(`${API_BASE}/api/forecast`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<ForecastBudget>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/forecast/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
