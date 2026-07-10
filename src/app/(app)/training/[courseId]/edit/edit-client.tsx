"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  clearLessonImage,
  deleteCourse,
  deleteLesson,
  deleteQuestion,
  moveLesson,
  moveQuestion,
  setLessonImage,
  updateCourse,
} from "@/app/(app)/training/actions";
import { LessonDialog } from "@/app/(app)/training/[courseId]/edit/lesson-dialog";
import { QuestionDialog } from "@/app/(app)/training/[courseId]/edit/question-dialog";
import { AiDraftDialog } from "@/app/(app)/training/[courseId]/edit/ai-draft-dialog";

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

export type LessonRow = {
  id: string;
  rank: number;
  titleEn: string;
  titleId: string;
  videoId: string | null;
  bodyEn: string | null;
  bodyId: string | null;
  imageMime: string | null;
  passPct: number;
  questions: QuestionRow[];
};

export type CourseRow = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  lessons: LessonRow[];
};

export type VideoOption = { id: string; titleEn: string; titleId: string };

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  FILL_BLANK: "Fill the blank",
  ORDER: "Put in order",
  PHOTO_SPOT: "Photo spot",
};

function summarizeConfig(q: QuestionRow): string {
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

export function CourseEditClient({
  course,
  videos,
}: {
  course: CourseRow;
  videos: VideoOption[];
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();

  const [titleEn, setTitleEn] = useState(course.titleEn);
  const [titleId, setTitleId] = useState(course.titleId);
  const [description, setDescription] = useState(course.description ?? "");

  const [lessonDialog, setLessonDialog] = useState<{ lesson: LessonRow | null } | null>(null);
  const [questionDialog, setQuestionDialog] = useState<{
    lessonId: string;
    question: QuestionRow | null;
  } | null>(null);
  const [draftDialog, setDraftDialog] = useState<{ lessonId: string; seed: string } | null>(null);

  function saveCourse(published?: boolean) {
    startT(async () => {
      const r = await updateCourse(course.id, {
        titleEn: titleEn.trim(),
        titleId: titleId.trim(),
        description: description.trim() || null,
        ...(published === undefined ? {} : { published }),
      });
      if (r.ok) {
        toast.success(
          published === undefined ? "Course saved" : published ? "Course published" : "Course unpublished",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/training"><ArrowLeft className="h-4 w-4" /> Training</Link>
          </Button>
          <h1 className="font-serif text-3xl">{course.titleEn}</h1>
          {course.published ? (
            <Badge variant="accent">Published</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Delete "${course.titleEn}" with all its lessons and questions?`)) return;
            startT(async () => {
              const r = await deleteCourse(course.id);
              if (r.ok) {
                toast.success("Course deleted");
                router.push("/training");
              } else toast.error(r.error);
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete course
        </Button>
      </header>

      {/* Course details */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Course details</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Published</span>
            <Switch
              checked={course.published}
              disabled={pending}
              onCheckedChange={(v) => {
                const msg = v
                  ? "Publish this course? Staff will see it under Training."
                  : "Unpublish this course? Staff will no longer see it.";
                if (!window.confirm(msg)) return;
                saveCourse(v);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title-en">Title (English)</Label>
              <Input id="edit-title-en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-title-id">Title (Indonesian)</Label>
              <Input id="edit-title-id" value={titleId} onChange={(e) => setTitleId(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={pending || !titleEn.trim() || !titleId.trim()}
              onClick={() => saveCourse()}
            >
              Save details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lessons */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lessons</h2>
        <Button size="sm" onClick={() => setLessonDialog({ lesson: null })}>
          <Plus className="h-3.5 w-3.5" /> Add lesson
        </Button>
      </div>

      {course.lessons.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No lessons yet. Add the first one — staff work through lessons in
            order, and each lesson can end with auto-marked questions.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {course.lessons.map((lesson, idx) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              index={idx}
              count={course.lessons.length}
              videos={videos}
              pending={pending}
              startT={startT}
              onEdit={() => setLessonDialog({ lesson })}
              onAddQuestion={() => setQuestionDialog({ lessonId: lesson.id, question: null })}
              onEditQuestion={(q) => setQuestionDialog({ lessonId: lesson.id, question: q })}
              onAiDraft={() =>
                setDraftDialog({
                  lessonId: lesson.id,
                  seed: [lesson.bodyEn, lesson.bodyId].filter(Boolean).join("\n\n"),
                })
              }
            />
          ))}
        </div>
      )}

      {/* Dialogs mount on demand so their state resets each open. */}
      {lessonDialog ? (
        <LessonDialog
          courseId={course.id}
          lesson={lessonDialog.lesson}
          videos={videos}
          onClose={() => setLessonDialog(null)}
        />
      ) : null}
      {questionDialog ? (
        <QuestionDialog
          lessonId={questionDialog.lessonId}
          question={questionDialog.question}
          onClose={() => setQuestionDialog(null)}
        />
      ) : null}
      {draftDialog ? (
        <AiDraftDialog
          lessonId={draftDialog.lessonId}
          seedMaterial={draftDialog.seed}
          open
          onClose={() => setDraftDialog(null)}
        />
      ) : null}
    </div>
  );
}

function LessonCard({
  lesson,
  index,
  count,
  videos,
  pending,
  startT,
  onEdit,
  onAddQuestion,
  onEditQuestion,
  onAiDraft,
}: {
  lesson: LessonRow;
  index: number;
  count: number;
  videos: VideoOption[];
  pending: boolean;
  startT: (cb: () => Promise<void>) => void;
  onEdit: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: QuestionRow) => void;
  onAiDraft: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Bumped after each upload so the <img> src changes and bypasses the
  // route's 5-minute private cache.
  const [imgVer, setImgVer] = useState(0);
  const video = lesson.videoId ? videos.find((v) => v.id === lesson.videoId) : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          {/* Rank arrows */}
          <div className="flex flex-col">
            <button
              type="button"
              disabled={pending || index === 0}
              onClick={() =>
                startT(async () => {
                  const r = await moveLesson(lesson.id, "up");
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                })
              }
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={pending || index === count - 1}
              onClick={() =>
                startT(async () => {
                  const r = await moveLesson(lesson.id, "down");
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                })
              }
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                Lesson {index + 1}
              </Badge>
              <span className="text-sm font-medium">{lesson.titleEn}</span>
              <span className="truncate text-xs text-muted-foreground">{lesson.titleId}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {video ? <Badge variant="secondary">🎬 {video.titleEn}</Badge> : null}
              {lesson.bodyEn || lesson.bodyId ? <Badge variant="outline">Text</Badge> : null}
              <span>Pass mark: {lesson.passPct}%</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending} title="Edit lesson">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Delete lesson"
              onClick={() => {
                if (!window.confirm(`Delete lesson "${lesson.titleEn}" and its questions?`)) return;
                startT(async () => {
                  const r = await deleteLesson(lesson.id);
                  if (r.ok) {
                    toast.success("Lesson deleted");
                    router.refresh();
                  } else toast.error(r.error);
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Teaching image */}
        <div className="flex items-center gap-2">
          {lesson.imageMime ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/training/image/lesson/${lesson.id}?v=${imgVer}`}
                alt=""
                className="h-16 w-16 rounded-md border object-cover"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startT(async () => {
                    const r = await clearLessonImage(lesson.id);
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
                const r = await setLessonImage(lesson.id, fd);
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
            {lesson.imageMime ? "Replace image" : "Upload image"}
          </Button>
        </div>

        {/* Questions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Questions ({lesson.questions.length})
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
          {lesson.questions.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No questions yet — the lesson auto-passes without them.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lesson.questions.map((q, qi) => (
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
                      disabled={pending || qi === lesson.questions.length - 1}
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
      </CardContent>
    </Card>
  );
}
