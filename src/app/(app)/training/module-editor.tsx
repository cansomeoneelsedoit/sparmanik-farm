"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearModuleImage,
  deleteQuestion,
  moveQuestion,
  setModuleImage,
} from "@/app/(app)/training/actions";

/**
 * Shared pieces for the superuser-only BUILDER surfaces — the course composer
 * (/training/[courseId]/edit) and the module library (/training/modules).
 * Modules live in a library and can sit in many courses, so both pages edit
 * the SAME module content through these sections. Hardcoded English, like
 * the rest of the builder.
 */

export type QuestionType = "MULTIPLE_CHOICE" | "FILL_BLANK" | "ORDER" | "PHOTO_SPOT";

export type QuestionRow = {
  id: string;
  rank: number;
  type: QuestionType;
  promptEn: string;
  promptId: string;
  imageMime: string | null;
  config: unknown;
};

/** A module as the builder pages select it — never the image bytes themselves
 *  (the client shows those via /api/training/image/module/[id]). */
export type ModuleRow = {
  id: string;
  titleEn: string;
  titleId: string;
  videoId: string | null;
  bodyEn: string | null;
  bodyId: string | null;
  imageMime: string | null;
  /** SCORM 1.2 package pointer "<moduleId>|<launchHref>" (see prisma schema). */
  scormPath: string | null;
  passPct: number;
  questions: QuestionRow[];
};

export type VideoOption = { id: string; titleEn: string; titleId: string };

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  FILL_BLANK: "Fill the blank",
  ORDER: "Put in order",
  PHOTO_SPOT: "Photo spot",
};

export function summarizeConfig(q: QuestionRow): string {
  const cfg = (q.config ?? {}) as Record<string, unknown>;
  if (q.type === "MULTIPLE_CHOICE" || q.type === "PHOTO_SPOT") {
    const options = Array.isArray(cfg.options) ? cfg.options.length : 0;
    const correct = Array.isArray(cfg.correct) ? cfg.correct.length : 0;
    return `${options} options · ${correct} correct`;
  }
  if (q.type === "FILL_BLANK") {
    const accept = Array.isArray(cfg.accept) ? cfg.accept.length : 0;
    return `${accept} accepted answer${accept === 1 ? "" : "s"}`;
  }
  const items = Array.isArray(cfg.items) ? cfg.items.length : 0;
  return `${items} items to order`;
}

/** Upload / replace / clear a module's teaching image. */
export function ModuleImageSection({
  module,
  pending,
  startT,
}: {
  module: ModuleRow;
  pending: boolean;
  startT: (cb: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Bumped after each upload so the <img> src changes and bypasses the
  // route's 5-minute private cache.
  const [imgVer, setImgVer] = useState(0);

  return (
    <div className="flex items-center gap-2">
      {module.imageMime ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/training/image/module/${module.id}?v=${imgVer}`}
            alt=""
            className="h-16 w-16 rounded-md border object-cover"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startT(async () => {
                const r = await clearModuleImage(module.id);
                if (r.ok) {
                  toast.success("Image removed");
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            <X className="h-3.5 w-3.5" /> Remove
          </Button>
        </>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          startT(async () => {
            const fd = new FormData();
            fd.set("file", file);
            const r = await setModuleImage(module.id, fd);
            if (r.ok) {
              toast.success("Image uploaded");
              setImgVer((v) => v + 1);
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        {module.imageMime ? "Replace image" : "Upload image"}
      </Button>
    </div>
  );
}

/** The module's question list: reorder / edit / delete, plus the add + AI-draft
 *  triggers (the dialogs themselves are mounted by the parent so their state
 *  resets each open). */
export function ModuleQuestionsSection({
  module,
  pending,
  startT,
  onAddQuestion,
  onEditQuestion,
  onAiDraft,
}: {
  module: ModuleRow;
  pending: boolean;
  startT: (cb: () => Promise<void>) => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: QuestionRow) => void;
  onAiDraft: () => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Questions ({module.questions.length})
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onAiDraft} disabled={pending}>
            <Sparkles className="h-3.5 w-3.5" /> AI draft
          </Button>
          <Button size="sm" variant="outline" onClick={onAddQuestion} disabled={pending}>
            <Plus className="h-3.5 w-3.5" /> Add question
          </Button>
        </div>
      </div>
      {module.questions.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No questions yet — the module auto-passes without them.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {module.questions.map((q, qi) => (
            <li key={q.id} className="flex items-center gap-2 p-2 text-sm">
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={pending || qi === 0}
                  onClick={() =>
                    startT(async () => {
                      const r = await moveQuestion(q.id, "up");
                      if (r.ok) router.refresh();
                      else toast.error(r.error);
                    })
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={pending || qi === module.questions.length - 1}
                  onClick={() =>
                    startT(async () => {
                      const r = await moveQuestion(q.id, "down");
                      if (r.ok) router.refresh();
                      else toast.error(r.error);
                    })
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {QUESTION_TYPE_LABELS[q.type]}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate">{q.promptEn}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {summarizeConfig(q)}
                  {q.imageMime ? " · has image" : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEditQuestion(q)}
                disabled={pending}
                title="Edit question"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                title="Delete question"
                onClick={() => {
                  if (!window.confirm("Delete this question?")) return;
                  startT(async () => {
                    const r = await deleteQuestion(q.id);
                    if (r.ok) {
                      toast.success("Question deleted");
                      router.refresh();
                    } else toast.error(r.error);
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
