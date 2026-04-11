import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { suppliersApi, type Supplier, type ShippingAddress } from "@/api/suppliers";
import { fmtIDR } from "@/lib/helpers";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

const CATEGORIES = ["Seeds", "Rockwool", "Nutrients raw", "Nutrients mixed", "Pots", "Irrigation", "General"];

export function SuppliersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showAddr, setShowAddr] = useState(false);
  const [address, setAddress] = useState<ShippingAddress | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [list, addr] = await Promise.all([suppliersApi.list(), suppliersApi.getAddress()]);
      setSuppliers(list);
      setAddress(addr);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of suppliers) {
      const c = s.category || "General";
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }, [suppliers]);

  const filtered = filterCat === "all" ? suppliers : suppliers.filter((s) => (s.category || "General") === filterCat);

  async function handleDelete(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete"))) return;
    try {
      await suppliersApi.remove(id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("suppliers")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("suppliers_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + {t("new_supplier")}
        </button>
      </div>

      {/* Category quick chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        <CatChip label={`${t("all")} (${suppliers.length})`} active={filterCat === "all"} onClick={() => setFilterCat("all")} />
        {CATEGORIES.map((c) => {
          const n = counts[c] || 0;
          if (n === 0) return null;
          return <CatChip key={c} label={`${c} (${n})`} active={filterCat === c} onClick={() => setFilterCat(c)} />;
        })}
      </div>

      {loading && <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>{t("loading")}</div>}

      {error && (
        <div className="card p-5" style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}>
          <div className="text-sm" style={{ color: "var(--red)" }}>{t("error")}: {error}</div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>{t("no_entries")}</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              {s.image_url && (
                <div
                  style={{
                    height: 140,
                    background: `url(${s.image_url}) center/cover`,
                  }}
                />
              )}
              <div className="p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span
                    className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                    style={{ background: "rgba(20,184,166,0.12)", color: "#14B8A6", borderColor: "rgba(20,184,166,0.2)" }}
                  >
                    {s.category}
                  </span>
                  {isOwner && (
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="rounded-md border px-2 py-1 text-xs"
                      style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="serif mb-1 text-xl">{s.product_name}</div>
                <div className="mb-2 text-xs" style={{ color: "var(--text-faint)" }}>{s.supplier_name}</div>
                <div className="line-clamp-2 mb-3 text-sm" style={{ color: "var(--text-dim)" }}>{s.description}</div>

                {/* Pricing breakdown */}
                <div
                  className="mb-3"
                  style={{
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 8,
                  }}
                >
                  <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-dim)" }}>
                    <span>{t("item_price")}</span>
                    <span className="mono">{fmtIDR(s.price)}</span>
                  </div>
                  {s.shipping_cost > 0 && (
                    <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-dim)" }}>
                      <span>{t("shipping_cost")}</span>
                      <span className="mono">{fmtIDR(s.shipping_cost)}</span>
                    </div>
                  )}
                  <div
                    className="flex items-baseline justify-between"
                    style={{ paddingTop: 6, borderTop: "1px solid var(--border)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>{t("total_with_shipping")}</span>
                    <span className="serif text-xl" style={{ color: "var(--accent)" }}>{fmtIDR(s.total_cost)}</span>
                  </div>
                </div>

                {s.source_url && (
                  <div className="flex justify-end">
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost"
                      style={{ minHeight: 28, padding: "4px 10px", fontSize: 11 }}
                    >
                      {t("view_source")} ↗
                    </a>
                  </div>
                )}

                {s.notes && (
                  <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>{s.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && address && (
        <NewSupplierModal
          address={address}
          onEditAddress={() => { setShowNew(false); setShowAddr(true); }}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refresh(); }}
        />
      )}

      {showAddr && address && (
        <ShippingAddressModal
          initial={address}
          onClose={() => setShowAddr(false)}
          onSaved={() => { setShowAddr(false); refresh(); }}
        />
      )}
    </div>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
      style={{
        background: active ? "rgba(20,184,166,0.18)" : "rgba(255,255,255,0.04)",
        color: active ? "#14B8A6" : "var(--text-dim)",
        borderColor: active ? "#14B8A6" : "var(--border)",
      }}
    >
      {label}
    </button>
  );
}

function NewSupplierModal({
  address,
  onEditAddress,
  onClose,
  onSaved,
}: {
  address: ShippingAddress;
  onEditAddress: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [product, setProduct] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Seeds");
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = (parseFloat(price) || 0) + (parseFloat(shipping) || 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await suppliersApi.create({
        supplier_name: name,
        product_name: product,
        description: desc,
        price: parseFloat(price) || 0,
        shipping_cost: parseFloat(shipping) || 0,
        category,
        image_url: imageUrl,
        source_url: sourceUrl,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:p-5"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[95vh] w-full max-w-[640px] overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8"
        style={{ borderColor: "var(--border-2)" }}
      >
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {t("new_supplier")}
        </div>
        <h2 className="serif mb-4 text-3xl">{t("suppliers")}</h2>

        {/* Delivery address card */}
        <div
          className="card mb-4 p-3"
          style={{ background: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.2)" }}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              📍 {t("delivery_to")}
            </div>
            <button
              type="button"
              onClick={onEditAddress}
              className="text-xs"
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
            >
              {t("change_address")}
            </button>
          </div>
          <div className="text-sm font-medium">{address.name} · {address.phone}</div>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>
            {address.address}, {address.city}, {address.region} {address.postcode}
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("source_link")}</label>
            <input
              className="input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://shopee.co.id/..."
            />
          </div>
          <div className="mb-4">
            <label className="label">{t("supplier_name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="label">{t("product_name")}</label>
            <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="label">{t("description")}</label>
            <textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="label">{t("category")}</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Pricing block */}
          <div
            className="card mb-4 p-4"
            style={{ background: "rgba(255,107,53,0.04)", borderColor: "rgba(255,107,53,0.15)" }}
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t("item_price")} (IDR)</label>
                <input
                  className="input"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">{t("shipping_cost")} (IDR)</label>
                <input
                  className="input"
                  type="number"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                />
              </div>
            </div>
            <div
              className="flex items-baseline justify-between"
              style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}
            >
              <div className="mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {t("total_with_shipping")}
              </div>
              <div className="serif text-2xl" style={{ color: "var(--accent)" }}>{fmtIDR(total)}</div>
            </div>
          </div>

          <div className="mb-4">
            <label className="label">{t("image_url")}</label>
            <input
              className="input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="mb-6">
            <label className="label">{t("note")}</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {err && <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>{err}</div>}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>{t("cancel")}</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShippingAddressModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ShippingAddress;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [addr, setAddr] = useState(initial.address);
  const [city, setCity] = useState(initial.city);
  const [region, setRegion] = useState(initial.region);
  const [postcode, setPostcode] = useState(initial.postcode);
  const [country, setCountry] = useState(initial.country);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await suppliersApi.updateAddress({
        name, phone, address: addr, city, region, postcode, country,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:p-5"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[95vh] w-full max-w-[600px] overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8"
        style={{ borderColor: "var(--border-2)" }}
      >
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {t("change_address")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("delivery_to")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Address</label>
            <textarea className="input" rows={3} value={addr} onChange={(e) => setAddr(e.target.value)} required />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">City / Kabupaten</label>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
            <div>
              <label className="label">Region / Provinsi</label>
              <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} required />
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Postcode</label>
              <input className="input" value={postcode} onChange={(e) => setPostcode(e.target.value)} required />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} required />
            </div>
          </div>
          {err && <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>{err}</div>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>{t("cancel")}</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
