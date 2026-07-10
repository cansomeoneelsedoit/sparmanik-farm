"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearQuestionImage,
  createQuestion,
  setQuestionImage,
  updateQuestion,
} from "@/app/(app)/training/actions";
import {
  QUESTION_TYPE_LABELS,
  type QuestionRow,
  type QuestionType,
} from "@/app/(app)/training/[courseId]/edit/edit-client";

type OptionRow = { en: string; id: string; correct: boolean };
type ItemRow = { en: string; id: string };

function initOptions(question: QuestionRow | null): OptionRow[] {
  if (question && (question.type === "MULTIPLE_CHOICE" || question.type === "PHOTO_SPOT")) {
    const cfg = question.config as { options?: { en?: string; id?: string }[]; correct?: number[] };
    const correct = new Set(cfg.correct ?? []);
    const rows = (cfg.options ?? []).map((o, i) => ({
      en: o.en ?? "",
      id: o.id ?? "",
      correct: correct.has(i),
    }));
    if (rows.length >= 2) return rows;
  }
  return [
    { en: "", id: "", correct: false },
    { en: "", id: "", correct: false },
  ];
}

function initAccept(question: QuestionRow | null): string[] {
  if (question?.type === "FILL_BLANK") {
    const cfg = question.config as { accept?: string[] };
    if (Array.isArray(cfg.accept) && cfg.accept.length > 0) return [...cfg.accept];
  }
  return [""];
}

function initItems(question: QuestionRow | null): ItemRow[] {
  if (question?.type === "ORDER") {
    const cfg = question.config as { items?: { en?: string; id?: string }[] };
    const rows = (cfg.items ?? []).map((o) => ({ en: o.en ?? "", id: o.id ?? "" }));
    if (rows.length >= 2) return rows;
  }
  return [
    { en: "", id: "" },
    { en: "", id: "" },
  ];
}

/**
 * Create/edit a question. Type is picked once on create and immutable after
 * (updateQuestion only accepts prompts + config). Mounted only while open so
 * state resets each time. On create, the optional image is uploaded in a
 * second call after the row exists (setQuestionImage needs the id).
 */
export function QuestionDialog({
  lessonId,
  question,
  onClose,
}: {
  lessonId: string;
  question: QuestionRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [type, setType] = useState<QuestionType>(question?.type ?? "MULTIPLE_CHOICE");
  const [promptEn, setPromptEn] = useState(question?.promptEn ?? "");
  const [promptId, setPromptId] = useState(question?.promptId ?? "");
  const [options, setOptions] = useState<OptionRow[]>(() => initOptions(question));
  const [accept, setAccept] = useState<string[]>(() => initAccept(question));
  const [items, setItems] = useState<ItemRow[]>(() => initItems(question));
  const [imageFile, setImageFile] = useState<File | null>(null);

  const isChoice = type === "MULTIPLE_CHOICE" || type === "PHOTO_SPOT";

  function submit() {
    const pe = promptEn.trim();
    const pi = promptId.trim();
    if (!pe || !pi) {
      toast.error("Both prompts (EN + ID) are required");
      return;
    }
    let config: unknown;
    if (isChoice) {
      const rows = options.map((r) => ({ en: r.en.trim(), id: r.id.trim(), correct: r.correct }));
      if (rows.some((r) => !r.en || !r.id)) {
        toast.error("Every option needs both EN and ID text");
        return;
      }
      const correct = rows.map((r, i) => (r.correct ? i : -1)).filter((i) => i >= 0);
      if (correct.length === 0) {
        toast.error("Mark at least one option as correct");
        return;
      }
      config = { options: rows.map(({ en, id }) => ({ en, id })), correct };
    } else if (type === "FILL_BLANK") {
      const rows = accept.map((a) => a.trim()).filter(Boolean);
      if (rows.length === 0) {
        toast.error("Add at least one accepted answer");
        return;
      }
      config = { accept: rows };
    } else {
      const rows = items.map((r) => ({ en: r.en.trim(), id: r.id.trim() }));
      if (rows.some((r) => !r.en || !r.id)) {
        toast.error("Every item needs both EN and ID text");
        return;
      }
      config = { items: rows };
    }
    if (type === "PHOTO_SPOT" && !imageFile && !question?.imageMime) {
      toast.error("Photo-spot questions need an image");
      return;
    }
    startT(async () => {
      let questionId = question?.id ?? null;
      if (question) {
        const r = await updateQuestion(question.id, { promptEn: pe, promptId: pi, config });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      } else {
        const r = await createQuestion({ lessonId, type, promptEn: pe, promptId: pi, config });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        questionId = r.data?.id ?? null;
      }
      if (imageFile && questionId) {
        const fd = new FormData();
        fd.set("file", imageFile);
        const r = await setQuestionImage(questionId, fd);
        if (!r.ok) {
          toast.error(`Question saved, but the image failed: ${r.error}`);
          onClose();
          router.refresh();
          return;
        }
      }
      toast.success(question ? "Question saved" : "Question added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            {question ? (
              <p className="text-sm">
                {QUESTION_TYPE_LABELS[question.type]}{" "}
                <span className="text-xs text-muted-foreground">(fixed after creation)</span>
              </p>
            ) : (
              <Select value={type} onValueChange={(v) => setType(v as QuestionType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-prompt-en">Prompt (English)</Label>
            <Input
              id="question-prompt-en"
              value={promptEn}
              onChange={(e) => setPromptEn(e.target.value)}
              placeholder="e.g. Which shoots do you remove?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question-prompt-id">Prompt (Indonesian)</Label>
            <Input
              id="question-prompt-id"
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              placeholder="e.g. Tunas mana yang dibuang?"
            />
          </div>

          {/* MULTIPLE_CHOICE / PHOTO_SPOT — option rows with correct checkboxes */}
          {isChoice ? (
            <div className="space-y-1.5">
              <Label>Options (tick the correct ones)</Label>
              <div className="space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={o.correct}
                      onChange={(e) =>
                        setOptions((rows) =>
                          rows.map((r, ri) => (ri === i ? { ...r, correct: e.target.checked } : r)),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-primary"
                      title="Correct answer"
                    />
                    <Input
                      value={o.en}
                      onChange={(e) =>
                        setOptions((rows) =>
                          rows.map((r, ri) => (ri === i ? { ...r, en: e.target.value } : r)),
                        )
                      }
                      placeholder={`Option ${i + 1} (EN)`}
                      className="h-8 text-xs"
                    />
                    <Input
                      value={o.id}
                      onChange={(e) =>
                        setOptions((rows) =>
                          rows.map((r, ri) => (ri === i ? { ...r, id: e.target.value } : r)),
                        )
                      }
                      placeholder={`Option ${i + 1} (ID)`}
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      disabled={options.length <= 2}
                      onClick={() => setOptions((rows) => rows.filter((_, ri) => ri !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      title="Remove option"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={options.length >= 8}
                onClick={() => setOptions((rows) => [...rows, { en: "", id: "", correct: false }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </Button>
            </div>
          ) : null}

          {/* FILL_BLANK — accepted answers */}
          {type === "FILL_BLANK" ? (
            <div className="space-y-1.5">
              <Label>Accepted answers (any language, case-insensitive)</Label>
              <div className="space-y-2">
                {accept.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={a}
                      onChange={(e) =>
                        setAccept((rows) => rows.map((r, ri) => (ri === i ? e.target.value : r)))
                      }
                      placeholder={`Accepted answer ${i + 1}`}
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      disabled={accept.length <= 1}
                      onClick={() => setAccept((rows) => rows.filter((_, ri) => ri !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      title="Remove answer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={accept.length >= 10}
                onClick={() => setAccept((rows) => [...rows, ""])}
              >
                <Plus className="h-3.5 w-3.5" /> Add answer
              </Button>
            </div>
          ) : null}

          {/* ORDER — items in the correct order */}
          {type === "ORDER" ? (
            <div className="space-y-1.5">
              <Label>Items</Label>
              <p className="text-xs text-muted-foreground">
                Enter in the correct order — the player shuffles them.
              </p>
              <div className="space-y-2">
                {items.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <Input
                      value={o.en}
                      onChange={(e) =>
                        setItems((rows) =>
                          rows.map((r, ri) => (ri === i ? { ...r, en: e.target.value } : r)),
                        )
                      }
                      placeholder={`Step ${i + 1} (EN)`}
                      className="h-8 text-xs"
                    />
                    <Input
                      value={o.id}
                      onChange={(e) =>
                        setItems((rows) =>
                          rows.map((r, ri) => (ri === i ? { ...r, id: e.target.value } : r)),
                        )
                      }
                      placeholder={`Step ${i + 1} (ID)`}
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      disabled={items.length <= 2}
                      onClick={() => setItems((rows) => rows.filter((_, ri) => ri !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      title="Remove item"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={items.length >= 8}
                onClick={() => setItems((rows) => [...rows, { en: "", id: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
          ) : null}

          {/* Question image */}
          <div className="space-y-1.5">
            <Label>
              Image {type === "PHOTO_SPOT" ? "(required)" : "(optional)"}
            </Label>
            {question?.imageMime && !imageFile ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/training/image/question/${question.id}`}
                  alt=""
                  className="h-16 w-16 rounded-md border object-cover"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startT(async () => {
                      const r = await clearQuestionImage(question.id);
                      if (r.ok) {
                        toast.success("Image removed");
                        onClose();
                        router.refresh();
                      } else toast.error(r.error);
                    })
                  }
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : null}
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {question ? "Save question" : "Add question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
