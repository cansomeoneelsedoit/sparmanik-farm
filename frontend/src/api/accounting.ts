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

export interface AccountingEntry {
  id: number;
  date: string;
  type: string;
  description: string;
  amount: number;
  category: string;
  source: string;
}

export interface AccountingTotals {
  income: number;
  expense: number;
  net: number;
  entry_count: number;
}

export interface AccountingEntryCreate {
  date: string;
  type: string;
  description: string;
  amount: number;
  category: string;
}

export interface SyncResult {
  sales_added: number;
  wages_added: number;
  message: string;
}

export const accountingApi = {
  list() {
    return fetch(`${API_BASE}/api/accounting`, { headers: authHeaders() }).then((r) =>
      json<AccountingEntry[]>(r)
    );
  },
  totals() {
    return fetch(`${API_BASE}/api/accounting/totals`, { headers: authHeaders() }).then((r) =>
      json<AccountingTotals>(r)
    );
  },
  create(payload: AccountingEntryCreate) {
    return fetch(`${API_BASE}/api/accounting`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<AccountingEntry>(r));
  },
  update(id: number, payload: Partial<AccountingEntryCreate>) {
    return fetch(`${API_BASE}/api/accounting/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<AccountingEntry>(r));
  },
  sync() {
    return fetch(`${API_BASE}/api/accounting/sync`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<SyncResult>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/accounting/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
