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

export interface Supplier {
  id: number;
  supplier_name: string;
  product_name: string;
  description: string;
  price: number;
  shipping_cost: number;
  total_cost: number;
  category: string;
  image_url: string;
  source_url: string;
  notes: string;
  created_at: string;
}

export interface SupplierCreate {
  supplier_name: string;
  product_name: string;
  description: string;
  price: number;
  shipping_cost: number;
  category: string;
  image_url: string;
  source_url: string;
  notes: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

export const suppliersApi = {
  list() {
    return fetch(`${API_BASE}/api/suppliers`, { headers: authHeaders() }).then((r) =>
      json<Supplier[]>(r)
    );
  },
  create(payload: SupplierCreate) {
    return fetch(`${API_BASE}/api/suppliers`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Supplier>(r));
  },
  update(id: number, payload: Partial<SupplierCreate>) {
    return fetch(`${API_BASE}/api/suppliers/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<Supplier>(r));
  },
  remove(id: number) {
    return fetch(`${API_BASE}/api/suppliers/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => json<void>(r));
  },
  getAddress() {
    return fetch(`${API_BASE}/api/suppliers/shipping-address`, { headers: authHeaders() }).then(
      (r) => json<ShippingAddress>(r)
    );
  },
  updateAddress(payload: ShippingAddress) {
    return fetch(`${API_BASE}/api/suppliers/shipping-address`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => json<ShippingAddress>(r));
  },
};
