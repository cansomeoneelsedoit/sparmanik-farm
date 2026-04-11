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

export interface Planting {
  id: number;
  variety: string;
  planting_date: string;
  harvest_estimate: string;
  beds: string;
  stage: string;
  notes: string;
  days_to_harvest: number;
}

export interface PlantingCreate {
  variety: string;
  planting_date: string;
  harvest_estimate: string;
  beds: string;
  stage: string;
  notes: string;
}

export const plantingsApi = {
  list() {
    return fetch(`${API_BASE}/api/plantings`, { headers: authHeaders() }).then((r) =>
      json<Planting[]>(r)
    );
  },
  create(payload: PlantingCreate) {
    return fetch(`${API_BASE}/api/plantings`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Planting>(r));
  },
  update(id: number, payload: Partial<PlantingCreate>) {
    return fetch(`${API_BASE}/api/plantings/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Planting>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/plantings/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
