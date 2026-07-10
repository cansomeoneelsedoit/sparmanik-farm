"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Library,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { coverArtFor } from "@/lib/cover-art";
import {
  addModuleToCourse,
  clearCourseImage,
  deleteCourse,
  deleteModule,
  moveModuleInCourse,
  removeModuleFromCourse,
  setCourseImage,
  updateCourse,
} from "@/app/(app)/training/actions";
import {
  ModuleImageSection,
  ModuleQuestionsSection,
  type ModuleRow,
  type QuestionRow,
  type VideoOption,
} from "@/app/(app)/training/module-editor";
import { ModuleDialog } from "@/app/(app)/training/[courseId]/edit/module-dialog";
import { QuestionDialog } from "@/app/(app)/training/[courseId]/edit/question-dialog";
import { AiDraftDialog } from "@/app/(app)/training/[courseId]/edit/ai-draft-dialog";

/** One CourseModule join row as the builder selects it. */
export type CourseModuleRow = {
  rank: number;
  module: ModuleRow;
};

export type CourseRow = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  published: boolean;
  imageMime: string | null;
  modules: CourseModuleRow[];
};

/** Library modules offered by the "Add existing" picker. */
export type LibraryModuleOption = { id: string; titleEn: string; titleId: string };

export function CourseEditClient({
  course,
  videos,
  libraryModules,
}: {
  course: CourseRow;
  videos: VideoOption[];
  libraryModules: LibraryModuleOption[];
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();

  const [titleEn, setTitleEn] = useState(course.titleEn);
  const [titleId, setTitleId] = useState(course.titleId);
  const [description, setDescription] = useState(course.description ?? "");

  const [moduleDialog, setModuleDialog] = useState<{ module: ModuleRow | null } | null>(null);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [questionDialog, setQuestionDialog] = useState<{
    moduleId: string;
    question: QuestionRow | null;
  } | null>(null);
  const [draftDialog, setDraftDialog] = useState<{ moduleId: string; seed: string } | null>(null);

  // Library modules that are NOT already in this course — the "Add existing" pool.
  const addableModules = useMemo(() => {
    const inCourse = new Set(course.modules.map((cm) => cm.module.id));
    return libraryModules.filter((m) => !inCourse.has(m.id));
  }, [course.modules, libraryModules]);

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
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/training/${course.id}/access`}>
              <BadgeDollarSign className="h-3.5 w-3.5" /> Access &amp; price
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/training/modules"><Library className="h-3.5 w-3.5" /> Module library</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  `Delete course "${course.titleEn}"? Its modules stay in the library (with their questions and staff attempts) — only this course and its ordering are removed.`,
                )
              )
                return;
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
        </div>
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
          <CourseCoverSection course={course} pending={pending} startT={startT} />
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

      {/* Modules */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Modules</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddExistingOpen(true)}
            disabled={addableModules.length === 0}
            title={
              addableModules.length === 0
                ? "Every library module is already in this course"
                : "Add a module from the library"
            }
          >
            <Library className="h-3.5 w-3.5" /> Add existing
          </Button>
          <Button size="sm" onClick={() => setModuleDialog({ module: null })}>
            <Plus className="h-3.5 w-3.5" /> New module
          </Button>
        </div>
      </div>

      {course.modules.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No modules yet. Create a new one or add an existing module from the
            library — staff work through modules in order, and each module can
            end with auto-marked questions.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {course.modules.map((cm, idx) => (
            <ModuleCard
              key={cm.module.id}
              courseId={course.id}
              module={cm.module}
              index={idx}
              count={course.modules.length}
              videos={videos}
              pending={pending}
              startT={startT}
              onEdit={() => setModuleDialog({ module: cm.module })}
              onAddQuestion={() => setQuestionDialog({ moduleId: cm.module.id, question: null })}
              onEditQuestion={(q) => setQuestionDialog({ moduleId: cm.module.id, question: q })}
              onAiDraft={() =>
                setDraftDialog({
                  moduleId: cm.module.id,
                  seed: [cm.module.bodyEn, cm.module.bodyId].filter(Boolean).join("\n\n"),
                })
              }
            />
          ))}
        </div>
      )}

      {/* Dialogs mount on demand so their state resets each open. */}
      {moduleDialog ? (
        <ModuleDialog
          courseId={course.id}
          module={moduleDialog.module}
          videos={videos}
          onClose={() => setModuleDialog(null)}
        />
      ) : null}
      {addExistingOpen ? (
        <AddExistingModuleDialog
          courseId={course.id}
          options={addableModules}
          onClose={() => setAddExistingOpen(false)}
        />
      ) : null}
      {questionDialog ? (
        <QuestionDialog
          moduleId={questionDialog.moduleId}
          question={questionDialog.question}
          onClose={() => setQuestionDialog(null)}
        />
      ) : null}
      {draftDialog ? (
        <AiDraftDialog
          moduleId={draftDialog.moduleId}
          seedMaterial={draftDialog.seed}
          open
          onClose={() => setDraftDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** Upload / replace / clear the course cover picture — mirrors
 *  ModuleImageSection (module-editor.tsx). Without an upload the course shows
 *  the generated gradient cover, previewed here as the placeholder. */
function CourseCoverSection({
  course,
  pending,
  startT,
}: {
  course: { id: string; imageMime: string | null };
  pending: boolean;
  startT: (cb: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Bumped after each upload so the <img> src changes and bypasses the
  // route's private cache.
  const [imgVer, setImgVer] = useState(0);

  return (
    <div className="space-y-1.5">
      <Label>Cover image</Label>
      <div className="flex flex-wrap items-center gap-3">
        {course.imageMime ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/training/image/course/${course.id}?v=${imgVer}`}
            alt=""
            className="h-20 w-36 rounded-md border object-cover"
          />
        ) : (
          <div
            className="flex h-20 w-36 items-center justify-center rounded-md border"
            style={{ backgroundImage: coverArtFor(course.id).background }}
            title="Generated cover (no image uploaded)"
          >
            <ImagePlus className="h-5 w-5 text-white/70" />
          </div>
        )}
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {course.imageMime ? "Replace image" : "Upload image"}
            </Button>
            {course.imageMime ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startT(async () => {
                    const r = await clearCourseImage(course.id);
                    if (r.ok) {
                      toast.success("Cover image removed");
                      router.refresh();
                    } else toast.error(r.error);
                  })
                }
              >
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Shown on the course card and as the course-page hero. Without one, a
            generated cover is used.
          </p>
        </div>
      </div>
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
            const r = await setCourseImage(course.id, fd);
            if (r.ok) {
              toast.success("Cover image uploaded");
              setImgVer((v) => v + 1);
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      />
    </div>
  );
}

/** Pick a library module (not already in the course) and join it at the end. */
function AddExistingModuleDialog({
  courseId,
  options,
  onClose,
}: {
  courseId: string;
  options: LibraryModuleOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [moduleId, setModuleId] = useState<string>("");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add existing module</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Module</Label>
          <Combobox
            value={moduleId}
            onChange={(v) => setModuleId(v ?? "")}
            placeholder="Pick a module from the library"
            options={options.map((m) => ({ value: m.id, label: m.titleEn, description: m.titleId }))}
            emptyHint="Every library module is already in this course"
          />
          <p className="text-xs text-muted-foreground">
            The module is added at the end of the course — its content and
            questions are shared with every other course that uses it.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !moduleId}
            onClick={() =>
              startT(async () => {
                const r = await addModuleToCourse(courseId, moduleId);
                if (r.ok) {
                  toast.success("Module added to course");
                  onClose();
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Add to course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModuleCard({
  courseId,
  module,
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
  courseId: string;
  module: ModuleRow;
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
  const video = module.videoId ? videos.find((v) => v.id === module.videoId) : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          {/* Rank arrows — reorder the JOIN within this course only */}
          <div className="flex flex-col">
            <button
              type="button"
              disabled={pending || index === 0}
              onClick={() =>
                startT(async () => {
                  const r = await moveModuleInCourse(courseId, module.id, "up");
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
                  const r = await moveModuleInCourse(courseId, module.id, "down");
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
                Module {index + 1}
              </Badge>
              <span className="text-sm font-medium">{module.titleEn}</span>
              <span className="truncate text-xs text-muted-foreground">{module.titleId}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {video ? <Badge variant="secondary">🎬 {video.titleEn}</Badge> : null}
              {module.bodyEn || module.bodyId ? <Badge variant="outline">Text</Badge> : null}
              <span>Pass mark: {module.passPct}%</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending} title="Edit module">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Remove from course (the module stays in the library)"
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove "${module.titleEn}" from this course? The module stays in the library (questions and attempts intact) and can be added back anytime.`,
                  )
                )
                  return;
                startT(async () => {
                  const r = await removeModuleFromCourse(courseId, module.id);
                  if (r.ok) {
                    toast.success("Module removed from course");
                    router.refresh();
                  } else toast.error(r.error);
                });
              }}
            >
              <X className="h-3.5 w-3.5" /> Remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Delete module from the library"
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete module "${module.titleEn}" from the LIBRARY? This removes it from EVERY course that uses it and permanently deletes its questions and staff attempts.`,
                  )
                )
                  return;
                startT(async () => {
                  const r = await deleteModule(module.id);
                  if (r.ok) {
                    toast.success("Module deleted");
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
        <ModuleImageSection module={module} pending={pending} startT={startT} />

        {/* Questions */}
        <ModuleQuestionsSection
          module={module}
          pending={pending}
          startT={startT}
          onAddQuestion={onAddQuestion}
          onEditQuestion={onEditQuestion}
          onAiDraft={onAiDraft}
        />
      </CardContent>
    </Card>
  );
}
