"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Youtube } from "lucide-react";
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

import { createCourseFromYouTube } from "./youtube-actions";

/**
 * "Course from YouTube" — paste a link, AI watches the video and drafts the
 * whole course (lessons + bilingual questions). Lands unpublished in the
 * builder for review. Superuser-only surface (the action is gated too).
 */
export function FromYouTubeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, startT] = useTransition();

  function generate() {
    startT(async () => {
      const r = await createCourseFromYouTube({ url: url.trim() });
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
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              AI is watching the video and writing the course — this can take a
              couple of minutes for a long video. Keep this open.
            </div>
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
