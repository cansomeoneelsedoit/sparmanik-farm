"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Youtube } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JobProgressBar } from "@/components/shared/job-progress-bar";

import { createCourseFromYouTube } from "./youtube-actions";

/**
 * "Course from YouTube" — paste a link, AI watches the video and drafts the
 * whole course (modules + bilingual questions). Lands unpublished in the
 * builder for review. Superuser-only surface (the action is gated too).
 * A live status bar (real stages + elapsed time) replaces the old spinner.
 */
export function FromYouTubeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, startT] = useTransition();

  function generate() {
    const id = crypto.randomUUID();
    setJobId(id);
    startT(async () => {
      const r = await createCourseFromYouTube({ url: url.trim(), jobId: id });
      setJobId(null);
      if (r.ok && r.data) {
        toast.success("Draft course created — review it before publishing.");
        setOpen(false);
        setUrl("");
        router.push(`/training/${r.data.courseId}/edit`);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't let the dialog close mid-generation — the action is still running.
        if (pending) return;
        setOpen(o);
        if (!o) setUrl("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Youtube className="mr-1.5 h-4 w-4" /> From YouTube
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-4 w-4" /> Course from a YouTube video
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">YouTube link</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={pending}
              autoFocus
            />
          </div>
          {pending ? (
            <JobProgressBar
              jobId={jobId}
              active={pending}
              stages={{
                _default: "Sending the video to the AI…",
                watching: "AI is watching the video and writing the course…",
                saving: "Saving modules",
                done: "Done!",
                error: "Something went wrong",
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              The AI watches the video, splits it into lessons in teaching order,
              and drafts questions in English + Bahasa Indonesia. Everything
              arrives as a <strong>draft</strong> — you review and edit before
              staff see it. The video plays in lesson 1.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={pending || !/youtube\.com|youtu\.be/.test(url)}>
            {pending ? "Working…" : "Build the course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
