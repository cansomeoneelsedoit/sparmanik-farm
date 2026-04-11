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

export interface Sop {
  id: number;
  title: string;
  title_key: string;
  category: string;
  description: string;
  steps: string[];
  safety_notes: string;
  frequency: string;
  image_url: string;
  version: number;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
}

export interface SopCreate {
  title: string;
  category: string;
  description: string;
  steps: string[];
  safety_notes: string;
  frequency: string;
  image_url: string;
}

export interface AiGenerateRequest {
  title: string;
  category: string;
  bullets: string;
  lang: string;
}

export interface AiGenerateResponse {
  description: string;
  steps: string[];
  safety_notes: string;
  frequency: string;
}

export const sopsApi = {
  list() {
    return fetch(`${API_BASE}/api/sops`, { headers: authHeaders() }).then((r) => json<Sop[]>(r));
  },
  archive() {
    return fetch(`${API_BASE}/api/sops/archive`, { headers: authHeaders() }).then((r) =>
      json<Sop[]>(r)
    );
  },
  create(payload: SopCreate) {
    return fetch(`${API_BASE}/api/sops`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Sop>(r));
  },
  replace(id: number, payload: SopCreate) {
    return fetch(`${API_BASE}/api/sops/${id}/replace`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Sop>(r));
  },
  archiveOne(id: number) {
    return fetch(`${API_BASE}/api/sops/${id}/archive`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<Sop>(r));
  },
  restore(id: number) {
    return fetch(`${API_BASE}/api/sops/${id}/restore`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<Sop>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/sops/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};

export const aiApi = {
  status() {
    return fetch(`${API_BASE}/api/ai/status`, { headers: authHeaders() }).then((r) =>
      json<{ configured: boolean; model: string }>(r)
    );
  },
  generateSop(payload: AiGenerateRequest) {
    return fetch(`${API_BASE}/api/ai/generate-sop`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<AiGenerateResponse>(r));
  },
  chat(question: string, history: { role: string; text: string }[], lang: string) {
    return fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, lang }),
    }).then((r) => json<{ text: string }>(r));
  },
};
