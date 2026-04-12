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

export interface StaffWage {
  id: number;
  name: string;
  role: string;
  week: number;
  date: string;
  hours: number;
  hourly_rate: number;
  wage_total: number;
}

export interface StaffProfile {
  name: string;
  role: string;
  total_hours: number;
  total_earned: number;
  weeks_worked: number;
  entries: StaffWage[];
}

export interface StaffWageCreate {
  name: string;
  role: string;
  week: number;
  date: string;
  hours: number;
  hourly_rate: number;
}

export const staffApi = {
  list() {
    return fetch(`${API_BASE}/api/staff`, { headers: authHeaders() }).then((r) =>
      json<StaffWage[]>(r)
    );
  },
  profiles() {
    return fetch(`${API_BASE}/api/staff/profiles`, { headers: authHeaders() }).then((r) =>
      json<StaffProfile[]>(r)
    );
  },
  create(payload: StaffWageCreate) {
    return fetch(`${API_BASE}/api/staff`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<StaffWage>(r));
  },
  update(id: number, payload: Partial<StaffWageCreate>) {
    return fetch(`${API_BASE}/api/staff/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<StaffWage>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/staff/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
