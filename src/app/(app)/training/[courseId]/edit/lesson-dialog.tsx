"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { createLesson, updateLesson } from "@/app/(app)/training/actions";
import type { LessonRow, VideoOption } from "@/app/(app)/training/[courseId]/edit/edit-client";

/**
 * Create/edit a lesson. Mounted only while open so state resets each time
 * (see the conditional render in edit-client.tsx).
 */
export function LessonDialog({
  courseId,
  lesson,
  videos,
  onClose,
}: {
  courseId: string;
  lesson: LessonRow | null;
  videos: VideoOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [titleEn, setTitleEn] = useState(lesson?.titleEn ?? "");
  const [titleId, setTitleId] = useState(lesson?.titleId ?? "");
  const [videoId, setVideoId] = useState(lesson?.videoId ?? "");
  const [bodyEn, setBodyEn] = useState(lesson?.bodyEn ?? "");
  const [bodyId, setBodyId] = useState(lesson?.bodyId ?? "");
  const [passPct, setPassPct] = useState(String(lesson?.passPct ?? 80));

  const videoOptions = [
    { value: "", label: "No video" },
    ...videos.map((v) => ({ value: v.id, label: v.titleEn, description: v.titleId })),
  ];

  function submit() {
    const pct = Number(passPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      toast.error("Pass mark must be a whole number between 0 and 100");
      return;
    }
    const payload = {
      titleEn: titleEn.trim(),
      titleId: titleId.trim(),
      videoId: videoId || null,
      bodyEn: bodyEn.trim() || null,
      bodyId: bodyId.trim() || null,
      passPct: pct,
    };
    startT(async () => {
      const r = lesson
        ? await updateLesson(lesson.id, payload)
        : await createLesson({ courseId, ...payload });
      if (r.ok) {
        toast.success(lesson ? "Lesson saved" : "Lesson added");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "Add lesson"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title-en">Title (English)</Label>
              <Input
                id="lesson-title-en"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Pruning side shoots"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title-id">Title (Indonesian)</Label>
              <Input
                id="lesson-title-id"
                value={titleId}
                onChange={(e) => setTitleId(e.target.value)}
                placeholder="e.g. Memangkas tunas samping"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Teaching video (optional)</Label>
            <Combobox
              value={videoId}
              onChange={(v) => setVideoId(v ?? "")}
              placeholder="No video"
              options={videoOptions}
              emptyHint="No videos in the library yet"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lesson-body-en">Teaching text — English (optional)</Label>
            <Textarea
              id="lesson-body-en"
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lesson-body-id">Teaching text — Indonesian (optional)</Label>
            <Textarea
              id="lesson-body-id"
              value={bodyId}
              onChange={(e) => setBodyId(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lesson-pass-pct">Pass mark (%)</Label>
            <Input
              id="lesson-pass-pct"
              type="number"
              min={0}
              max={100}
              value={passPct}
              onChange={(e) => setPassPct(e.target.value)}
              className="max-w-[8rem]"
            />
            <p className="text-xs text-muted-foreground">
              Minimum score to pass this lesson and unlock the next one.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !titleEn.trim() || !titleId.trim()}
          >
            {lesson ? "Save lesson" : "Add lesson"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
