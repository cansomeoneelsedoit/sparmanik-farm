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

export type RecipeGroup = "A" | "B";
export type RecipeSection = "MAKRO A" | "MIKRO A" | "MAKRO B" | "MIKRO B";

export interface RecipeIngredient {
  id?: number;
  position: number;
  name: string;
  group: RecipeGroup;
  section: RecipeSection;
  doses: Record<string, number>;
  supplier: string;
}

export interface RecipeComment {
  id: number;
  author: string;
  text: string;
  created_at: string;
}

export interface Recipe {
  id: number;
  name_en: string;
  name_id: string;
  crop_target_en: string;
  crop_target_id: string;
  stage_en: string;
  stage_id: string;
  ec_target: number;
  ph_target: number;
  concentrates: number[];
  instructions_en: string;
  instructions_id: string;
  notes_en: string;
  notes_id: string;
  author: string;
  locked: boolean;
  version: number;
  created_at: string;
  modified_at: string;
  ingredients: RecipeIngredient[];
  comments: RecipeComment[];
}

export interface RecipeListItem {
  id: number;
  name_en: string;
  name_id: string;
  crop_target_en: string;
  crop_target_id: string;
  stage_en: string;
  stage_id: string;
  ec_target: number;
  ph_target: number;
  author: string;
  locked: boolean;
  version: number;
  ingredient_count: number;
}

export interface RecipeCreatePayload {
  name_en: string;
  name_id: string;
  crop_target_en: string;
  crop_target_id: string;
  stage_en: string;
  stage_id: string;
  ec_target: number;
  ph_target: number;
  concentrates: number[];
  instructions_en: string;
  instructions_id: string;
  notes_en: string;
  notes_id: string;
  author: string;
  ingredients: Omit<RecipeIngredient, "id">[];
}

export const recipesApi = {
  list() {
    return fetch(`${API_BASE}/api/recipes`, { headers: authHeaders() }).then((r) =>
      json<RecipeListItem[]>(r)
    );
  },
  get(id: number) {
    return fetch(`${API_BASE}/api/recipes/${id}`, { headers: authHeaders() }).then((r) =>
      json<Recipe>(r)
    );
  },
  create(payload: RecipeCreatePayload) {
    return fetch(`${API_BASE}/api/recipes`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Recipe>(r));
  },
  update(id: number, payload: Partial<RecipeCreatePayload>) {
    return fetch(`${API_BASE}/api/recipes/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Recipe>(r));
  },
  lock(id: number) {
    return fetch(`${API_BASE}/api/recipes/${id}/lock`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<Recipe>(r));
  },
  unlock(id: number) {
    return fetch(`${API_BASE}/api/recipes/${id}/unlock`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<Recipe>(r));
  },
  clone(id: number) {
    return fetch(`${API_BASE}/api/recipes/${id}/clone`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => json<Recipe>(r));
  },
  addComment(id: number, text: string) {
    return fetch(`${API_BASE}/api/recipes/${id}/comments`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => json<RecipeComment>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/recipes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
};
