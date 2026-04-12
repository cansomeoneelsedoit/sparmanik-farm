import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { videosApi, type Video } from "@/api/videos";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

const SUGGESTED_CATEGORIES = ["Melons", "Chillis", "General", "Nutrients", "Irrigation", "Pest control"];
const SUGGESTED_SUBS = ["Seeding", "Growing", "Flowering", "Fruiting", "Harvest", "Maintenance", "Tour", "Other"];

/** Convert any YouTube URL to embeddable format */
function toEmbedUrl(raw: string): string {
  let url = raw.trim();
  // youtube.com/watch?v=ID
  if (url.includes("youtube.com/watch?v=")) {
    const id = url.split("v=")[1].split("&")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  // youtu.be/ID
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1].split("?")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  // youtube.com/shorts/ID
  if (url.includes("youtube.com/shorts/")) {
    const id = url.split("/shorts/")[1].split("?")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  // youtube.com/live/ID
  if (url.includes("youtube.com/live/")) {
    const id = url.split("/live/")[1].split("?")[0];
    return `https://www.youtube.com/embed/${id}`;
  }
  // Already an embed URL or other — return as-is
  return url;
}

export function VideosPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [editingItem, setEditingItem] = useState<Video | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await videosApi.list();
      setVideos(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const tree = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const v of videos) {
      const c = v.category || "General";
      const s = v.subcategory || "General";
      if (!m[c]) m[c] = new Set();
      m[c].add(s);
    }
    return m;
  }, [videos]);

  const cats = Object.keys(tree).sort();

  const filtered = videos.filter((v) => {
    if (cat !== "all" && v.category !== cat) return false;
    if (sub !== "all" && v.subcategory !== sub) return false;
    return true;
  });

  async function handleDelete(id: number) {
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete"))) return;
    try {
      await videosApi.remove(id);
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
            {t("videos")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("videos_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + {t("new_video")}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label className="label">{t("category")}</label>
          <select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setSub("all"); }}>
            <option value="all">{t("all")}</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {cat !== "all" && tree[cat] && (
          <div className="min-w-[160px] flex-1">
            <label className="label">{t("sub_category")}</label>
            <select className="input" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="all">{t("all")}</option>
              {Array.from(tree[cat]).sort().map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        {(cat !== "all" || sub !== "all") && (
          <button
            className="btn btn-ghost"
            style={{ alignSelf: "flex-end", minHeight: 36, padding: "8px 14px", fontSize: 12 }}
            onClick={() => { setCat("all"); setSub("all"); }}
          >
            {t("clear")}
          </button>
        )}
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
        <div className="grid gap-5 lg:grid-cols-2">
          {filtered.map((v) => (
            <div key={v.id} className="card overflow-hidden">
              <div style={{ position: "relative", paddingBottom: "56.25%", background: "rgba(255,255,255,0.03)" }}>
                <iframe
                  src={toEmbedUrl(v.url)}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={v.title}
                />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-1">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA", borderColor: "rgba(167,139,250,0.2)" }}
                      >
                        {v.category}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", borderColor: "rgba(96,165,250,0.2)" }}
                      >
                        {v.subcategory || "General"}
                      </span>
                    </div>
                    <div className="font-medium">{v.title}</div>
                    {v.notes && (
                      <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{v.notes}</div>
                    )}
                  </div>
                  {isOwner && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => setEditingItem(v)}
                        className="rounded-md border px-2 py-1 text-xs"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          color: "var(--text)",
                          borderColor: "var(--border)",
                        }}
                      >
                        ✏
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="rounded-md border px-2 py-1 text-xs"
                        style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewVideoModal
          item={null}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refresh(); }}
        />
      )}

      {editingItem && (
        <NewVideoModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); refresh(); }}
        />
      )}
    </div>
  );
}

function NewVideoModal({ item, onClose, onSaved }: { item: Video | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(item?.title ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [category, setCategory] = useState(item?.category ?? "Melons");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "Tour");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      // Convert any YouTube URL to embeddable format
      const cleanUrl = toEmbedUrl(url);
      const payload = { title, url: cleanUrl, category, subcategory, notes };
      if (item) {
        await videosApi.update(item.id, payload);
      } else {
        await videosApi.create(payload);
      }
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
          {item ? t("edit") : t("new_video")}
        </div>
        <h2 className="serif mb-6 text-3xl">{t("videos")}</h2>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="label">{t("title")}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("category")}</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {SUGGESTED_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t("sub_category")}</label>
              <select className="input" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                {SUGGESTED_SUBS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">{t("video_url")}</label>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
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
