const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const ACCESS_KEY = "sparmanik_access_token";
const REFRESH_KEY = "sparmanik_refresh_token";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (tokenStore.access && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${tokenStore.access}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !isRetry && tokenStore.refresh) {
    // Try refresh once
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, options, true);
    }
    tokenStore.clear();
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.detail ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore.refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenStore.refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokenStore.set(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export interface UserOut {
  id: number;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  language: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const api = {
  async login(email: string, password: string): Promise<TokenResponse> {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new ApiError(res.status, data.detail ?? "Login failed");
    }
    return res.json();
  },

  me() {
    return request<UserOut>("/api/auth/me");
  },

  updateLanguage(language: "en" | "id") {
    return request<UserOut>("/api/auth/me/language", {
      method: "PATCH",
      body: JSON.stringify({ language }),
    });
  },
};
