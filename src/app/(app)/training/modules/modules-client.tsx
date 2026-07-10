"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronUp, Library, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteModule } from "@/app/(app)/training/actions";
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

/** A library module with the courses it appears in (via CourseModule). */
export type LibraryModuleRow = ModuleRow & {
  courses: { course: { id: string; titleEn: string; published: boolean } }[];
};

export function ModuleLibraryClient({
  modules,
  videos,
}: {
  modules: LibraryModuleRow[];
  videos: VideoOption[];
}) {
  const [pending, startT] = useTransition();

  const [moduleDialog, setModuleDialog] = useState<{ module: ModuleRow | null } | null>(null);
  const [questionDialog, setQuestionDialog] = useState<{
    moduleId: string;
    question: QuestionRow | null;
  } | null>(null);
  const [draftDialog, setDraftDialog] = useState<{ moduleId: string; seed: string } | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/training"><ArrowLeft className="h-4 w-4" /> Training</Link>
          </Button>
          <div>
            <h1 className="font-serif text-3xl">Module library</h1>
            <p className="text-sm text-muted-foreground">
              Build a module once, reuse it in any course. Editing here changes
              it everywhere it appears.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setModuleDialog({ module: null })}>
          <Plus className="h-3.5 w-3.5" /> New module
        </Button>
      </header>

      {modules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Library className="h-8 w-8 opacity-50" />
            No modules yet. Create the first one here, or from any course
            builder — every module lands in this library.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((m) => (
            <LibraryModuleCard
              key={m.id}
              module={m}
              videos={videos}
              pending={pending}
              startT={startT}
              onEdit={() => setModuleDialog({ module: m })}
              onAddQuestion={() => setQuestionDialog({ moduleId: m.id, question: null })}
              onEditQuestion={(q) => setQuestionDialog({ moduleId: m.id, question: q })}
              onAiDraft={() =>
                setDraftDialog({
                  moduleId: m.id,
                  seed: [m.bodyEn, m.bodyId].filter(Boolean).join("\n\n"),
                })
              }
            />
          ))}
        </div>
      )}

      {/* Dialogs mount on demand so their state resets each open. No courseId —
          a module created here is standalone until added to a course. */}
      {moduleDialog ? (
        <ModuleDialog
          module={moduleDialog.module}
          videos={videos}
          onClose={() => setModuleDialog(null)}
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

function LibraryModuleCard({
  module,
  videos,
  pending,
  startT,
  onEdit,
  onAddQuestion,
  onEditQuestion,
  onAiDraft,
}: {
  module: LibraryModuleRow;
  videos: VideoOption[];
  pending: boolean;
  startT: (cb: () => Promise<void>) => void;
  onEdit: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: QuestionRow) => void;
  onAiDraft: () => void;
}) {
  const router = useRouter();
  // The content editor (image + questions) is tucked away so a long library
  // stays scannable — expanded per module on demand.
  const [expanded, setExpanded] = useState(false);
  const video = module.videoId ? videos.find((v) => v.id === module.videoId) : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{module.titleEn}</span>
              <span className="truncate text-xs text-muted-foreground">{module.titleId}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {module.questions.length} question{module.questions.length === 1 ? "" : "s"}
              </Badge>
              {module.courses.length === 0 ? (
                <Badge variant="secondary">Standalone — not in any course</Badge>
              ) : (
                module.courses.map(({ course }) => (
                  <Badge key={course.id} variant="outline" title={course.published ? "Published course" : "Draft course"}>
                    <Link href={`/training/${course.id}/edit`} className="hover:underline">
                      {course.titleEn}
                    </Link>
                  </Badge>
                ))
              )}
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
              title="Delete module from the library"
              onClick={() => {
                const usedIn =
                  module.courses.length === 0
                    ? "It is not in any course."
                    : `This removes it from ${module.courses.length} course${module.courses.length === 1 ? "" : "s"}.`;
                if (
                  !window.confirm(
                    `Delete module "${module.titleEn}" from the LIBRARY? ${usedIn} Its questions and staff attempts are permanently deleted.`,
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Hide image & questions" : "Edit image & questions"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Questions
            </Button>
          </div>
        </div>

        {expanded ? (
          <>
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
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
