"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DraftQuestion } from "@/server/quiz-draft";

import { createQuestion } from "@/app/(app)/training/actions";
import { draftQuizAction } from "./draft-actions";
import { QUESTION_TYPE_LABELS } from "./edit-client";

/**
 * "AI draft questions" — paste/confirm the lesson material, AI drafts bilingual
 * questions, Boyd unticks any he doesn't want, and the keepers are saved
 * through the normal createQuestion validation. Nothing publishes untouched.
 */
export function AiDraftDialog({
  lessonId,
  seedMaterial,
  open,
  onClose,
}: {
  lessonId: string;
  /** Prefill: the lesson's body text (best quiz source Boyd already wrote). */
  seedMaterial: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [material, setMaterial] = useState(seedMaterial);
  const [count, setCount] = useState("5");
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [pending, startT] = useTransition();

  function generate() {
    startT(async () => {
      const r = await draftQuizAction({ material, count: Number(count) });
      if (r.ok && r.data) {
        setDrafts(r.data.questions);
        setKeep(r.data.questions.map(() => true));
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  function saveKept() {
    if (!drafts) return;
    const chosen = drafts.filter((_, i) => keep[i]);
    if (chosen.length === 0) {
      toast.error("Nothing ticked to add.");
      return;
    }
    startT(async () => {
      let added = 0;
      for (const d of chosen) {
        const r = await createQuestion({
          lessonId,
          type: d.type,
          promptEn: d.promptEn,
          promptId: d.promptId,
          config: d.config,
        });
        if (r.ok) added++;
        else toast.error(r.error);
      }
      if (added > 0) {
        toast.success(`Added ${added} question${added > 1 ? "s" : ""}`);
        router.refresh();
        reset();
        onClose();
      }
    });
  }

  function reset() {
    setDrafts(null);
    setKeep([]);
    setMaterial(seedMaterial);
  }

  function describe(d: DraftQuestion): string {
    if (d.type === "MULTIPLE_CHOICE") {
      const c = d.config as { options: { en: string }[]; correct: number[] };
      return c.options
        .map((o, i) => `${c.correct.includes(i) ? "✓" : "·"} ${o.en}`)
        .join("  ");
    }
    if (d.type === "FILL_BLANK") {
      return `accepts: ${(d.config as { accept: string[] }).accept.join(" / ")}`;
    }
    return (d.config as { items: { en: string }[] }).items.map((it) => it.en).join(" → ");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> AI draft questions
          </DialogTitle>
        </DialogHeader>

        {drafts === null ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Material to quiz on</Label>
              <Textarea
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                rows={8}
                placeholder="Paste the lesson text / SOP here — questions are drafted strictly from this."
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">How many</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["3", "5", "8", "10"].map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={generate} disabled={pending || material.trim().length < 30}>
                {pending ? "Drafting…" : "Draft with AI"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Untick anything you don&apos;t want, then add. You can edit any question
              afterwards like a hand-written one.
            </p>
            {drafts.map((d, i) => (
              <label
                key={i}
                className="flex items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-foreground"
                  checked={keep[i] ?? false}
                  onChange={(e) =>
                    setKeep((prev) => prev.map((k, j) => (j === i ? e.target.checked : k)))
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {QUESTION_TYPE_LABELS[d.type]}
                  </span>
                  <span className="block font-medium">{d.promptEn}</span>
                  <span className="block text-xs text-muted-foreground">{d.promptId}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{describe(d)}</span>
                </span>
              </label>
            ))}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset} disabled={pending}>
                Start over
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={pending}>
            Cancel
          </Button>
          {drafts !== null ? (
            <Button onClick={saveKept} disabled={pending || keep.every((k) => !k)}>
              {pending ? "Adding…" : `Add ${keep.filter(Boolean).length} question${keep.filter(Boolean).length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
