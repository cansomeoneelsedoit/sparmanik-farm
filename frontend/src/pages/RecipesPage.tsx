import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import {
  recipesApi,
  type Recipe,
  type RecipeListItem,
  type RecipeIngredient,
  type RecipeGroup,
  type RecipeSection,
} from "@/api/recipes";

const OWNER_EMAILS = new Set([
  "boydsparrow@gmail.com",
  "bintangdamanik85@gmail.com",
  "sparmanikfarm@gmail.com",
]);

const CONCENTRATES = [1, 5, 25, 50];
const SECTIONS: RecipeSection[] = ["MAKRO A", "MIKRO A", "MAKRO B", "MIKRO B"];

function fmtDose(d: number): string {
  if (d === 0) return "0";
  if (d % 1 === 0) return d.toString();
  return d.toFixed(3).replace(/\.?0+$/, "");
}

function localeName(r: { name_en: string; name_id: string }, lang: string) {
  return lang === "id" && r.name_id ? r.name_id : r.name_en;
}
function localeCrop(r: { crop_target_en: string; crop_target_id: string }, lang: string) {
  return lang === "id" && r.crop_target_id ? r.crop_target_id : r.crop_target_en;
}
function localeStage(r: { stage_en: string; stage_id: string }, lang: string) {
  return lang === "id" && r.stage_id ? r.stage_id : r.stage_en;
}
function localeInstructions(r: { instructions_en: string; instructions_id: string }, lang: string) {
  return lang === "id" && r.instructions_id ? r.instructions_id : r.instructions_en;
}
function localeNotes(r: { notes_en: string; notes_id: string }, lang: string) {
  return lang === "id" && r.notes_id ? r.notes_id : r.notes_en;
}

export function RecipesPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isOwner = user ? OWNER_EMAILS.has(user.email.toLowerCase()) : false;

  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await recipesApi.list();
      setRecipes(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("recipes")}
          </div>
          <h1 className="serif text-4xl lg:text-5xl">{t("recipes_title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          + {t("new_recipe")}
        </button>
      </div>

      {loading && (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      )}

      {error && (
        <div
          className="card mb-4 p-5"
          style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.2)" }}
        >
          <div className="text-sm" style={{ color: "var(--red)" }}>
            {t("error")}: {error}
          </div>
          <button className="btn btn-ghost mt-3" onClick={refresh}>
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && !error && recipes.length === 0 && (
        <div className="card p-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {t("no_recipes")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {recipes.map((r) => (
          <button
            key={r.id}
            onClick={() => setViewingId(r.id)}
            className="card p-5 text-left transition hover:brightness-110"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="serif text-xl leading-tight">{localeName(r, lang)}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                  {localeCrop(r, lang)} · {localeStage(r, lang)}
                  {r.author ? ` · ${r.author}` : ""}
                </div>
              </div>
              {r.locked ? (
                <span
                  className="inline-flex flex-shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                  style={{
                    background: "rgba(255,184,77,0.12)",
                    color: "#FFB84D",
                    borderColor: "rgba(255,184,77,0.2)",
                  }}
                >
                  🔒 {t("locked")}
                </span>
              ) : (
                <span
                  className="inline-flex flex-shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium"
                  style={{
                    background: "rgba(74,222,128,0.12)",
                    color: "#4ADE80",
                    borderColor: "rgba(74,222,128,0.2)",
                  }}
                >
                  {t("unlocked")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t("ec_target")} value={r.ec_target.toString()} />
              <Stat label={t("ph_target")} value={r.ph_target.toString()} />
              <Stat label={t("ingredients")} value={r.ingredient_count.toString()} />
            </div>
          </button>
        ))}
      </div>

      {viewingId && (
        <RecipeViewer
          recipeId={viewingId}
          isOwner={isOwner}
          onClose={() => setViewingId(null)}
          onEdit={(r) => {
            setViewingId(null);
            setEditing(r);
          }}
          onChanged={refresh}
        />
      )}

      {editing && (
        <RecipeEditor
          recipe={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mono mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

// ============================================================
// Modal shell
// ============================================================
function Modal({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:p-5"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`card max-h-[95vh] w-full ${wide ? "max-w-[960px]" : "max-w-[700px]"} overflow-y-auto rounded-t-[20px] p-6 sm:rounded-[20px] sm:p-8`}
        style={{ borderColor: "var(--border-2)" }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Recipe table (shared by viewer and print)
// ============================================================
function RecipeTable({ recipe }: { recipe: Recipe }) {
  const { t } = useI18n();
  const concs = recipe.concentrates?.length ? recipe.concentrates : CONCENTRATES;

  // Group ingredients by section, preserving order from the database
  const sections: { name: string; items: RecipeIngredient[] }[] = [];
  const seen = new Map<string, RecipeIngredient[]>();
  for (const ing of recipe.ingredients) {
    const key = ing.section || (ing.group === "A" ? "MAKRO A" : "MAKRO B");
    if (!seen.has(key)) {
      const arr: RecipeIngredient[] = [];
      seen.set(key, arr);
      sections.push({ name: key, items: arr });
    }
    seen.get(key)!.push(ing);
  }

  // Totals per concentrate
  const totals: Record<string, number> = {};
  concs.forEach((c) => (totals[String(c)] = 0));
  for (const ing of recipe.ingredients) {
    for (const c of concs) {
      totals[String(c)] += ing.doses?.[String(c)] ?? 0;
    }
  }

  return (
    <div className="recipe-table-wrap">
      <table className="recipe-table">
        <thead>
          <tr>
            <th rowSpan={2} style={{ textAlign: "left" }}>{t("material")}</th>
            <th rowSpan={2}>{t("group")}</th>
            {concs.map((c) => (
              <th key={c} colSpan={2}>
                {t("concentrate")} {c}L
              </th>
            ))}
            <th rowSpan={2} style={{ textAlign: "left" }}>{t("supplier_product")}</th>
          </tr>
          <tr>
            {concs.map((c) => (
              <>
                <th key={`x-${c}`}>×</th>
                <th key={`g-${c}`}>{t("grams")}</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <>
              <tr key={`sec-${sec.name}`} className="section-header">
                <td colSpan={3 + concs.length * 2}>{sec.name}</td>
              </tr>
              {sec.items.map((ing, i) => (
                <tr key={`${sec.name}-${i}`} className={ing.group === "A" ? "group-a-row" : "group-b-row"}>
                  <td>{ing.name}</td>
                  <td style={{ textAlign: "center", fontWeight: 700 }} className={ing.group === "A" ? "gol-a" : "gol-b"}>
                    {ing.group}
                  </td>
                  {concs.map((c) => (
                    <>
                      <td key={`${sec.name}-${i}-x-${c}`} className="col-num">{c}</td>
                      <td key={`${sec.name}-${i}-g-${c}`} className="col-num">{fmtDose(ing.doses?.[String(c)] ?? 0)}</td>
                    </>
                  ))}
                  <td style={{ fontSize: 11, color: "var(--text-dim)" }}>{ing.supplier ?? ""}</td>
                </tr>
              ))}
            </>
          ))}
          <tr className="total-row">
            <td>{t("total_row")}</td>
            <td></td>
            {concs.map((c) => (
              <>
                <td key={`total-x-${c}`}></td>
                <td key={`total-g-${c}`} className="col-num">
                  {fmtDose(totals[String(c)])}
                </td>
              </>
            ))}
            <td></td>
          </tr>
        </tbody>
      </table>
      <style>{`
        .recipe-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .recipe-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .recipe-table th {
          padding: 8px 6px; text-align: center; font-size: 10px;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
          color: var(--text-dim); border-bottom: 2px solid var(--border-2);
          background: rgba(255,255,255,0.03); white-space: nowrap;
        }
        .recipe-table td {
          padding: 8px 6px; border-bottom: 1px solid var(--border); font-size: 12px;
        }
        .recipe-table .group-a-row { background: rgba(255,107,53,0.04); }
        .recipe-table .group-b-row { background: rgba(96,165,250,0.04); }
        .recipe-table .section-header td {
          background: rgba(255,255,255,0.05); font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px;
          color: var(--text); padding: 10px 8px;
        }
        .recipe-table .col-num {
          text-align: right; font-family: "JetBrains Mono", monospace; font-size: 11px;
        }
        .recipe-table .gol-a { color: #FF6B35; }
        .recipe-table .gol-b { color: #60A5FA; }
        .recipe-table .total-row { font-weight: 700; background: rgba(255,255,255,0.06); }
        .recipe-table .total-row td { padding: 12px 8px; border-top: 2px solid var(--border-2); }

        @media print {
          body::before, .sidebar, aside, header, [data-no-print] { display: none !important; }
          body { background: white !important; color: black !important; }
          .recipe-table { color: black !important; }
          .recipe-table th, .recipe-table td { color: black !important; border-color: #999 !important; }
          .recipe-table .group-a-row { background: #ffe4d4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .recipe-table .group-b-row { background: #d4e9ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .recipe-table .section-header td { background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Viewer modal (read-only with actions)
// ============================================================
function RecipeViewer({
  recipeId,
  isOwner,
  onClose,
  onEdit,
  onChanged,
}: {
  recipeId: number;
  isOwner: boolean;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onChanged: () => void;
}) {
  const { t, lang } = useI18n();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const r = await recipesApi.get(recipeId);
      setRecipe(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, [recipeId]);

  async function handleLockToggle() {
    if (!recipe) return;
    if (recipe.locked) {
      if (!confirm(t("unlock_confirm"))) return;
    }
    setBusy(true);
    try {
      const updated = recipe.locked
        ? await recipesApi.unlock(recipe.id)
        : await recipesApi.lock(recipe.id);
      setRecipe(updated);
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClone() {
    if (!recipe) return;
    setBusy(true);
    try {
      await recipesApi.clone(recipe.id);
      onChanged();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!recipe) return;
    if (!isOwner) {
      alert(t("only_owners_delete"));
      return;
    }
    if (!confirm(t("confirm_delete") + "\n\n" + localeName(recipe, lang))) return;
    setBusy(true);
    try {
      await recipesApi.remove(recipe.id);
      onChanged();
      onClose();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  async function handlePostComment() {
    if (!recipe || !commentText.trim()) return;
    setBusy(true);
    try {
      await recipesApi.addComment(recipe.id, commentText.trim());
      setCommentText("");
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (error) {
    return (
      <Modal onClose={onClose}>
        <div className="text-sm" style={{ color: "var(--red)" }}>
          {error}
        </div>
        <button className="btn btn-ghost mt-4 w-full" onClick={onClose}>
          {t("close")}
        </button>
      </Modal>
    );
  }

  if (!recipe) {
    return (
      <Modal onClose={onClose}>
        <div className="text-sm" style={{ color: "var(--text-faint)" }}>
          {t("loading")}
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} wide>
      <div id="recipe-print-area">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3" data-no-print>
          <div className="min-w-0 flex-1">
            <div className="mono mb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {localeCrop(recipe, lang)} · {localeStage(recipe, lang)}
            </div>
            <h2 className="serif text-3xl lg:text-4xl">{localeName(recipe, lang)}</h2>
          </div>
          {recipe.locked ? (
            <span
              className="inline-flex flex-shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: "rgba(255,184,77,0.12)",
                color: "#FFB84D",
                borderColor: "rgba(255,184,77,0.2)",
              }}
            >
              🔒 {t("locked")}
            </span>
          ) : (
            <span
              className="inline-flex flex-shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: "rgba(74,222,128,0.12)",
                color: "#4ADE80",
                borderColor: "rgba(74,222,128,0.2)",
              }}
            >
              {t("unlocked")}
            </span>
          )}
        </div>

        {/* Print-only header */}
        <div className="print-only" style={{ display: "none", marginBottom: 16, textAlign: "center" }}>
          <h1 style={{ fontFamily: "serif", fontSize: 24, marginBottom: 4 }}>Sparmanik Farm</h1>
          <div style={{ fontSize: 14 }}>{localeName(recipe, lang)}</div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {localeCrop(recipe, lang)} · {localeStage(recipe, lang)} · EC {recipe.ec_target} · pH {recipe.ph_target}
          </div>
        </div>
        <style>{`@media print { .print-only { display: block !important; } }`}</style>

        <div className="mb-5 grid grid-cols-3 gap-3" data-no-print>
          <div className="card p-3 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("ec_target")}
            </div>
            <div className="serif mt-1 text-2xl">{recipe.ec_target}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("ph_target")}
            </div>
            <div className="serif mt-1 text-2xl">{recipe.ph_target}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="mono text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("ingredients")}
            </div>
            <div className="serif mt-1 text-2xl">{recipe.ingredients.length}</div>
          </div>
        </div>

        <RecipeTable recipe={recipe} />

        {localeInstructions(recipe, lang) && (
          <div className="mt-6" data-no-print>
            <h3 className="serif mb-2 text-xl">{t("instructions")}</h3>
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>
              {localeInstructions(recipe, lang)}
            </div>
          </div>
        )}

        {localeNotes(recipe, lang) && (
          <div className="mt-4 text-xs" data-no-print style={{ color: "var(--text-faint)" }}>
            <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>{t("recipe_notes_label")}: </span>
            {localeNotes(recipe, lang)}
          </div>
        )}

        {/* Comments */}
        <div className="mt-6" data-no-print>
          <h3 className="serif mb-3 text-xl">
            {t("comments")} {recipe.comments.length > 0 && `(${recipe.comments.length})`}
          </h3>
          <div className="space-y-2">
            {recipe.comments.map((c) => (
              <div key={c.id} className="card p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="mono mb-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {c.author} · {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="text-sm">{c.text}</div>
              </div>
            ))}
          </div>
          {!recipe.locked ? (
            <div className="mt-3 flex gap-2">
              <input
                className="input flex-1"
                placeholder={t("add_comment")}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button type="button" className="btn btn-ghost" onClick={handlePostComment} disabled={busy}>
                {t("post")}
              </button>
            </div>
          ) : (
            <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
              🔒 {t("locked_edit_warning")}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-4 text-xs" data-no-print style={{ color: "var(--text-faint)" }}>
          {recipe.author && `${t("author")}: ${recipe.author} · `}
          {recipe.created_at && `${t("created")}: ${new Date(recipe.created_at).toLocaleDateString()}`}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex flex-wrap gap-2" data-no-print>
        <button className="btn btn-ghost" onClick={onClose}>
          {t("close")}
        </button>
        <button className="btn btn-ghost" onClick={handlePrint}>
          🖨 {t("print")}
        </button>
        <button className="btn btn-ghost" onClick={handleClone} disabled={busy}>
          ⎘ {t("clone_recipe")}
        </button>
        <button className="btn btn-ghost" onClick={handleLockToggle} disabled={busy}>
          {recipe.locked ? `🔓 ${t("unlock_recipe")}` : `🔒 ${t("lock_recipe")}`}
        </button>
        {!recipe.locked && (
          <button className="btn btn-primary flex-1" onClick={() => onEdit(recipe)} disabled={busy}>
            ✎ {t("edit")}
          </button>
        )}
        {!recipe.locked && isOwner && (
          <button
            className="btn btn-ghost"
            style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.3)" }}
            onClick={handleDelete}
            disabled={busy}
          >
            {t("delete")}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// Editor modal (create / edit)
// ============================================================
function RecipeEditor({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();

  const [nameEn, setNameEn] = useState(recipe?.name_en ?? "");
  const [nameId, setNameId] = useState(recipe?.name_id ?? "");
  const [cropEn, setCropEn] = useState(recipe?.crop_target_en ?? "");
  const [cropId, setCropId] = useState(recipe?.crop_target_id ?? "");
  const [stageEn, setStageEn] = useState(recipe?.stage_en ?? "Vegetative");
  const [stageId, setStageId] = useState(recipe?.stage_id ?? "Vegetatif");
  const [ec, setEc] = useState(recipe?.ec_target.toString() ?? "2.0");
  const [ph, setPh] = useState(recipe?.ph_target.toString() ?? "6.0");
  const [instEn, setInstEn] = useState(recipe?.instructions_en ?? "");
  const [instId, setInstId] = useState(recipe?.instructions_id ?? "");
  const [notesEn, setNotesEn] = useState(recipe?.notes_en ?? "");
  const [notesId, setNotesId] = useState(recipe?.notes_id ?? "");
  const [author, setAuthor] = useState(recipe?.author ?? user?.name ?? "");

  const [ingredients, setIngredients] = useState<Omit<RecipeIngredient, "id">[]>(
    recipe?.ingredients.map((i, idx) => ({
      position: idx,
      name: i.name,
      group: i.group,
      section: i.section,
      doses: { ...i.doses },
      supplier: i.supplier,
    })) ?? []
  );

  // New ingredient form state
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<RecipeGroup>("A");
  const [newSection, setNewSection] = useState<RecipeSection>("MAKRO A");
  const [newD1, setNewD1] = useState("");
  const [newD5, setNewD5] = useState("");
  const [newD25, setNewD25] = useState("");
  const [newD50, setNewD50] = useState("");
  const [newSupplier, setNewSupplier] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addIngredient() {
    if (!newName.trim()) return;
    setIngredients((prev) => [
      ...prev,
      {
        position: prev.length,
        name: newName.trim(),
        group: newGroup,
        section: newSection,
        doses: {
          "1": parseFloat(newD1) || 0,
          "5": parseFloat(newD5) || 0,
          "25": parseFloat(newD25) || 0,
          "50": parseFloat(newD50) || 0,
        },
        supplier: newSupplier,
      },
    ]);
    setNewName("");
    setNewD1("");
    setNewD5("");
    setNewD25("");
    setNewD50("");
    setNewSupplier("");
  }

  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const payload = {
      name_en: nameEn.trim(),
      name_id: nameId.trim(),
      crop_target_en: cropEn.trim(),
      crop_target_id: cropId.trim(),
      stage_en: stageEn,
      stage_id: stageId,
      ec_target: parseFloat(ec) || 0,
      ph_target: parseFloat(ph) || 0,
      concentrates: recipe?.concentrates ?? [1, 5, 25, 50],
      instructions_en: instEn,
      instructions_id: instId,
      notes_en: notesEn,
      notes_id: notesId,
      author: author.trim(),
      ingredients: ingredients.map((ing, idx) => ({ ...ing, position: idx })),
    };
    try {
      if (recipe) {
        await recipesApi.update(recipe.id, payload);
      } else {
        await recipesApi.create(payload);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {recipe ? t("edit") : t("new_recipe")}
      </div>
      <h2 className="serif mb-6 text-3xl">{t("recipes")}</h2>

      <form onSubmit={onSubmit}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("recipe_name")} (EN)</label>
            <input className="input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("recipe_name")} (ID)</label>
            <input className="input" value={nameId} onChange={(e) => setNameId(e.target.value)} />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("crop_target")} (EN)</label>
            <input className="input" value={cropEn} onChange={(e) => setCropEn(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("crop_target")} (ID)</label>
            <input className="input" value={cropId} onChange={(e) => setCropId(e.target.value)} />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("growth_stage")} (EN)</label>
            <select className="input" value={stageEn} onChange={(e) => setStageEn(e.target.value)}>
              <option>Seedling</option>
              <option>Vegetative</option>
              <option>Flowering</option>
              <option>Generative</option>
              <option>Fruiting</option>
              <option>Ripening</option>
            </select>
          </div>
          <div>
            <label className="label">{t("growth_stage")} (ID)</label>
            <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option>Bibit</option>
              <option>Vegetatif</option>
              <option>Berbunga</option>
              <option>Generatif</option>
              <option>Berbuah</option>
              <option>Pematangan</option>
            </select>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("ec_target")}</label>
            <input className="input" type="number" step="0.1" value={ec} onChange={(e) => setEc(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t("ph_target")}</label>
            <input className="input" type="number" step="0.1" value={ph} onChange={(e) => setPh(e.target.value)} required />
          </div>
        </div>

        {/* Ingredient list */}
        <label className="label">{t("ingredients")}</label>
        <div className="card mb-3 overflow-y-auto p-3" style={{ maxHeight: 300 }}>
          {ingredients.length === 0 ? (
            <div className="py-4 text-center text-xs" style={{ color: "var(--text-faint)" }}>
              {t("no_items")}
            </div>
          ) : (
            <table className="recipe-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{t("material")}</th>
                  <th>{t("group")}</th>
                  <th>1L</th>
                  <th>5L</th>
                  <th>25L</th>
                  <th>50L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => (
                  <tr key={i} className={ing.group === "A" ? "group-a-row" : "group-b-row"}>
                    <td>{ing.name}</td>
                    <td style={{ textAlign: "center" }} className={ing.group === "A" ? "gol-a" : "gol-b"}>
                      {ing.group}
                    </td>
                    <td className="col-num">{fmtDose(ing.doses["1"] ?? 0)}</td>
                    <td className="col-num">{fmtDose(ing.doses["5"] ?? 0)}</td>
                    <td className="col-num">{fmtDose(ing.doses["25"] ?? 0)}</td>
                    <td className="col-num">{fmtDose(ing.doses["50"] ?? 0)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeIngredient(i)}
                        className="rounded-md border px-2 py-1 text-xs"
                        style={{
                          background: "rgba(248,113,113,0.1)",
                          color: "var(--red)",
                          borderColor: "rgba(248,113,113,0.2)",
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add ingredient form */}
        <div
          className="card mb-4 p-3"
          style={{ background: "rgba(255,107,53,0.04)", borderColor: "rgba(255,107,53,0.15)" }}
        >
          <div className="mono mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {t("add_ingredient")}
          </div>
          <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: "2fr 70px 1fr" }}>
            <input className="input" placeholder={t("material")} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className="input" value={newGroup} onChange={(e) => setNewGroup(e.target.value as RecipeGroup)}>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
            <select className="input" value={newSection} onChange={(e) => setNewSection(e.target.value as RecipeSection)}>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="mb-2 grid grid-cols-4 gap-2">
            <div>
              <label className="label">1L</label>
              <input className="input" type="number" step="0.001" placeholder="g" value={newD1} onChange={(e) => setNewD1(e.target.value)} />
            </div>
            <div>
              <label className="label">5L</label>
              <input className="input" type="number" step="0.001" placeholder="g" value={newD5} onChange={(e) => setNewD5(e.target.value)} />
            </div>
            <div>
              <label className="label">25L</label>
              <input className="input" type="number" step="0.001" placeholder="g" value={newD25} onChange={(e) => setNewD25(e.target.value)} />
            </div>
            <div>
              <label className="label">50L</label>
              <input className="input" type="number" step="0.001" placeholder="g" value={newD50} onChange={(e) => setNewD50(e.target.value)} />
            </div>
          </div>
          <input className="input mb-2" placeholder={t("supplier_product")} value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
          <button type="button" className="btn btn-ghost w-full" onClick={addIngredient}>
            + {t("add_to_recipe")}
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("instructions")} (EN)</label>
            <textarea className="input" rows={3} value={instEn} onChange={(e) => setInstEn(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("instructions")} (ID)</label>
            <textarea className="input" rows={3} value={instId} onChange={(e) => setInstId(e.target.value)} />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("recipe_notes_label")} (EN)</label>
            <textarea className="input" rows={2} value={notesEn} onChange={(e) => setNotesEn(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("recipe_notes_label")} (ID)</label>
            <textarea className="input" rows={2} value={notesId} onChange={(e) => setNotesId(e.target.value)} />
          </div>
        </div>

        <div className="mb-6">
          <label className="label">{t("author")}</label>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>

        {err && (
          <div className="mb-4 text-sm" style={{ color: "var(--red)" }}>
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            {saving ? t("loading") : t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
