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

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: number;
  title: string;
  due_date: string;
  priority: string;
  category: string;
  notes: string;
  done: boolean;
  assignees: string[];
  created_at: string;
}

export interface TaskCreate {
  title: string;
  due_date: string;
  priority: string;
  category: string;
  notes: string;
  done: boolean;
  assignees: string[];
}

export interface TaskUpdate {
  title?: string;
  due_date?: string;
  priority?: string;
  category?: string;
  notes?: string;
  done?: boolean;
  assignees?: string[];
}

export const tasksApi = {
  list() {
    return fetch(`${API_BASE}/api/tasks`, { headers: authHeaders() }).then((r) =>
      json<Task[]>(r)
    );
  },
  create(payload: TaskCreate) {
    return fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Task>(r));
  },
  update(id: number, payload: TaskUpdate) {
    return fetch(`${API_BASE}/api/tasks/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Task>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/tasks/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
