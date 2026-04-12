import { useState, useEffect, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { sopsApi, aiApi, type Sop, type AiGenerateResponse } from "@/api/sops";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

const CATEGORIES = ["Melon", "Chilli", "Nutrients", "Irrigation", "Harvest", "Pest control", "General"];

export function SopsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [view, setView] = useState<"active" | "archive">("active");
  const [active, setActive] = useState<Sop[]>([]);
  const [archived, setArchived] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [replacing, setReplacing] = useState<Sop | null>(null);
  const [viewing, setViewing] = useState<Sop | null>(null);
  const [editing, setEditing] = useState<Sop | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [a, ar] = await Promise.all([sopsApi.list(), sopsApi.archive()]);
      setActive(a);
      setArchived(ar);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const list = view === "archive" ? archived : active;

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("sops")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("sops_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowBuilder(true)}>
          ✨ {t("new_with_ai")}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <TabPill label={`${t("active")} (${active.length})`} active={view === "active"} onClick={() => setView("active")} />
        <TabPill label={`${t("archive")} (${archived.length})`} active={view === "archive"} onClick={() => setView("archive")} />
      </div>

      {loading && <div className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>{t("loading")}</div>}

      {error && (
        <div className="card p-5" style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}>
          <div className="text-sm" style={{ color: "var(--red)" }}>{t("error")}: {error}</div>
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>{t("no_entries")}</div>
      )}

      {!loading && !error && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((sop) => (
            <button
              key={sop.id}
              onClick={() => setViewing(sop)}
              className="card p-5 text-left transition hover:brightness-110"
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                  style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.2)" }}
                >
                  {sop.category}
                </span>
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)", borderColor: "var(--border)" }}
                >
                  v{sop.version}
                </span>
              </div>
              <div className="serif mt-2 mb-2 text-xl">{sop.title}</div>
              <div className="line-clamp-2 text-xs" style={{ color: "var(--text-dim)" }}>
                {sop.description}
              </div>
              <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
                {sop.steps.length} {t("steps").toLowerCase()}
                {sop.archived_at && ` · archived ${sop.archived_at.slice(0, 10)}`}
              </div>
            </button>
          ))}
        </div>
      )}

      {showBuilder && (
        <SopBuilderModal
          replacing={null}
          onClose={() => setShowBuilder(false)}
          onSaved={() => { setShowBuilder(false); refresh(); }}
        />
      )}

      {replacing && (
        <SopBuilderModal
          replacing={replacing}
          onClose={() => setReplacing(null)}
          onSaved={() => { setReplacing(null); setViewing(null); refresh(); }}
        />
      )}

      {viewing && (
        <SopViewerModal
          sop={viewing}
          source={view}
          archived={archived.filter((a) => a.title_key === viewing.title_key)}
          isOwner={isOwner}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onReplace={() => { setReplacing(viewing); }}
          onArchive={async () => {
            try {
              await sopsApi.archiveOne(viewing.id);
              setViewing(null);
              refresh();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
          onRestore={async () => {
            try {
              await sopsApi.restore(viewing.id);
              setViewing(null);
              refresh();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
          onDelete={async () => {
            if (!confirm(t("perm_delete_sop"))) return;
            try {
              await sopsApi.remove(viewing.id);
              setViewing(null);
              refresh();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        />
      )}

      {editing && (
        <SopBuilderModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-4 py-1.5 text-xs font-medium transition"
      style={{
        background: active ? "rgba(255,107,53,0.18)" : "rgba(255,255,255,0.04)",
        color: active ? "#FF6B35" : "var(--text-dim)",
        borderColor: active ? "#FF6B35" : "var(--border)",
      }}
    >
      {label}
    </button>
  );
}

function SopViewerModal({
  sop,
  source,
  archived,
  isOwner,
  onClose,
  onEdit,
  onReplace,
  onArchive,
  onRestore,
  onDelete,
}: {
  sop: Sop;
  source: "active" | "archive";
  archived: Sop[];
  isOwner: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReplace: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const previousVersions = archived.filter((a) => a.id !== sop.id).sort((a, b) => b.version - a.version);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:p-5"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[95vh] w-full max-w-[700px] overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8"
        style={{ borderColor: "var(--border-2)" }}
      >
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
              style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.2)" }}
            >
              {sop.category}
            </span>
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)", borderColor: "var(--border)" }}
            >
              v{sop.version}
            </span>
            {source === "archive" && (
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "rgba(255,184,77,0.12)", color: "#FFB84D", borderColor: "rgba(255,184,77,0.2)" }}
              >
                Archived
              </span>
            )}
          </div>
          <h2 className="serif text-3xl">{sop.title}</h2>
        </div>

        <div className="mb-4" style={{ color: "var(--text-dim)" }}>
          {sop.description}
        </div>

        {sop.frequency && (
          <div className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
            <span className="font-medium" style={{ color: "var(--text-dim)" }}>{t("frequency")}: </span>
            {sop.frequency}
          </div>
        )}

        <h3 className="serif mb-3 text-xl">{t("steps")}</h3>
        <ol style={{ listStyle: "none", padding: 0 }}>
          {sop.steps.map((step, i) => (
            <li key={i} className="mb-3 flex gap-3">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "rgba(255,107,53,0.15)",
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  flexShrink: 0,
                  fontSize: 13,
                }}
              >
                {i + 1}
              </div>
              <div className="flex-1 text-sm">{step}</div>
            </li>
          ))}
        </ol>

        {sop.safety_notes && (
          <div
            className="card mt-4 p-4"
            style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}
          >
            <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              ⚠ {t("safety")}
            </div>
            <div className="text-sm">{sop.safety_notes}</div>
          </div>
        )}

        {previousVersions.length > 0 && source === "active" && (
          <div className="mt-6">
            <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("previous_versions")}
            </div>
            {previousVersions.map((v) => (
              <div key={v.id} className="mb-1 text-xs" style={{ color: "var(--text-dim)" }}>
                v{v.version} · archived {(v.archived_at ?? "").slice(0, 10)}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn btn-ghost flex-1" onClick={onClose}>{t("close")}</button>
          {source === "active" && (
            <>
              <button className="btn btn-ghost" onClick={onEdit}>✏ {t("edit")}</button>
              <button className="btn btn-ghost" onClick={onReplace}>✨ {t("replace_with_new")}</button>
              <button className="btn btn-ghost" onClick={onArchive}>📦 {t("archive_sop")}</button>
            </>
          )}
          {source === "archive" && (
            <>
              <button className="btn btn-ghost" onClick={onRestore}>↺ {t("restore")}</button>
              {isOwner && (
                <button
                  className="rounded-md border px-3 py-2 text-xs font-medium"
                  style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}
                  onClick={onDelete}
                >
                  {t("delete")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SopBuilderModal({
  replacing,
  editing,
  onClose,
  onSaved,
}: {
  replacing?: Sop | null;
  editing?: Sop | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const sop = editing ?? replacing ?? null;
  const [title, setTitle] = useState(sop?.title ?? "");
  const [category, setCategory] = useState(sop?.category ?? "Melon");
  const [bullets, setBullets] = useState("");
  const [imageUrl, setImageUrl] = useState(sop?.image_url ?? "");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<AiGenerateResponse | null>(editing ? { description: editing.description, steps: editing.steps, safety_notes: editing.safety_notes, frequency: editing.frequency } : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleGenerate() {
    if (!title.trim() || !bullets.trim()) {
      setErr(t("fill_title_bullets"));
      return;
    }
    setGenerating(true);
    setErr(null);
    setDraft(null);
    try {
      const result = await aiApi.generateSop({ title, category, bullets, lang });
      setDraft(result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title,
        category,
        description: draft.description,
        steps: draft.steps,
        safety_notes: draft.safety_notes,
        frequency: draft.frequency,
        image_url: imageUrl,
      };
      if (editing) {
        await sopsApi.update(editing.id, payload);
      } else if (replacing) {
        await sopsApi.replace(replacing.id, payload);
      } else {
        await sopsApi.create(payload);
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
        className="card max-h-[95vh] w-full max-w-[700px] overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8"
        style={{ borderColor: "var(--border-2)" }}
      >
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {editing ? t("edit") : replacing ? t("replace_with_new") : t("new_with_ai")}
        </div>
        <h2 className="serif mb-2 text-3xl">{t("ai_sop_builder")}</h2>
        <div className="mb-6 text-sm" style={{ color: "var(--text-dim)" }}>{editing ? t("edit_sop_details") : t("ai_sop_intro")}</div>

        <div className="mb-4">
          <label className="label">{t("title")}</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mixing AB nutrient for melon"
          />
        </div>

        <div className="mb-4">
          <label className="label">{t("category")}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <label className="label">{t("key_points")}</label>
          <textarea
            className="input"
            rows={6}
            value={bullets}
            onChange={(e) => setBullets(e.target.value)}
            placeholder="- pH should be 5.8 to 6.2&#10;- check EC every morning&#10;- top up reservoir before noon"
          />
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

        {generating && (
          <div className="card mb-4 p-4" style={{ background: "rgba(255,107,53,0.06)", borderColor: "rgba(255,107,53,0.2)" }}>
            <div className="text-sm">{t("generating")}</div>
          </div>
        )}

        {draft && (
          <div className="card mb-4 p-4" style={{ background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.2)" }}>
            <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              ✓ {t("ai_draft")}
            </div>
            <div className="mb-3 text-sm" style={{ color: "var(--text-dim)" }}>{draft.description}</div>
            {draft.frequency && (
              <div className="mb-2 text-xs" style={{ color: "var(--text-faint)" }}>
                <span style={{ color: "var(--text-dim)" }}>{t("frequency")}: </span>{draft.frequency}
              </div>
            )}
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {draft.steps.map((s, i) => (
                <li key={i} className="mb-2 flex gap-2">
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: "rgba(255,107,53,0.15)",
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 text-sm">{s}</div>
                </li>
              ))}
            </ol>
            {draft.safety_notes && (
              <div className="mt-3 text-xs" style={{ color: "var(--red)" }}>⚠ {draft.safety_notes}</div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 32, padding: "6px 12px", fontSize: 11 }}
                onClick={handleGenerate}
                disabled={generating}
              >
                ↻ {t("regenerate")}
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                style={{ minHeight: 32, padding: "6px 12px", fontSize: 11 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t("loading") : t("save_sop")}
              </button>
            </div>
          </div>
        )}

        {err && (
          <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>{err}</div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>{t("cancel")}</button>
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={handleGenerate}
            disabled={generating}
          >
            ✨ {t("generate_with_ai")}
          </button>
        </div>
      </div>
    </div>
  );
}
