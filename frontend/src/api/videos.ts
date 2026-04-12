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

export interface Video {
  id: number;
  title: string;
  url: string;
  category: string;
  subcategory: string;
  notes: string;
}

export interface VideoCreate {
  title: string;
  url: string;
  category: string;
  subcategory: string;
  notes: string;
}

export const videosApi = {
  list() {
    return fetch(`${API_BASE}/api/videos`, { headers: authHeaders() }).then((r) =>
      json<Video[]>(r)
    );
  },
  create(payload: VideoCreate) {
    return fetch(`${API_BASE}/api/videos`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Video>(r));
  },
  update(id: number, payload: Partial<VideoCreate>) {
    return fetch(`${API_BASE}/api/videos/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Video>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/videos/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
