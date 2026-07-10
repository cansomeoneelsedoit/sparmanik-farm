"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { JobProgressBar } from "@/components/shared/job-progress-bar";

import { createCourseFromSop } from "./course-actions";

/**
 * "Build a course from this SOP" — one module per SOP step with AI-drafted
 * questions, landing as a DRAFT in the Training builder. Superuser-only
 * surface (the action is gated too). Live status bar with per-step progress.
 */
export function BuildCourseButton({ sopId }: { sopId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function build() {
    const id = crypto.randomUUID();
    setJobId(id);
    setRunning(true);
    try {
      const r = await createCourseFromSop({ sopId, jobId: id });
      if (r.ok && r.data) {
        toast.success("Draft course created — review it before publishing.");
        setOpen(false);
        router.push(`/training/${r.data.courseId}/edit`);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setRunning(false);
      setJobId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <GraduationCap className="mr-1.5 h-4 w-4" /> Build course
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> Build a course from this SOP
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm text-muted-foreground">
          <p>
            Each SOP step becomes a course module (with its Indonesian + English
            text), and the AI drafts 2–3 questions per module. Everything lands
            as a <strong>draft</strong> in the Training builder for your review —
            the SOP itself is untouched.
          </p>
          {running ? (
            <JobProgressBar
              jobId={jobId}
              active={running}
              stages={{
                _default: "Starting…",
                drafting: "AI is drafting questions per step",
                saving: "Saving modules",
                done: "Done!",
                error: "Something went wrong",
              }}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={build} disabled={running}>
            {running ? "Building…" : "Build the course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
