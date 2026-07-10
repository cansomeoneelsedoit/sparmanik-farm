"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileArchive, Upload, X } from "lucide-react";

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
import { createModule, updateModule } from "@/app/(app)/training/actions";
import { addUploadedVideo, uploadVideoFile } from "@/app/(app)/videos/actions";
import { clearModuleScorm, setModuleScorm } from "@/app/(app)/training/scorm-actions";
import type { ModuleRow, VideoOption } from "@/app/(app)/training/module-editor";

/**
 * Create/edit a module. Mounted only while open so state resets each time
 * (see the conditional renders in edit-client.tsx and modules-client.tsx).
 * Used from BOTH the course composer (courseId set — a new module is joined
 * to that course at the end) and the module library (no courseId — the new
 * module is standalone until added to a course).
 *
 * Only one language is required: leave the other blank and the save
 * auto-translates it (falling back to a copy if the AI is unavailable).
 */
export function ModuleDialog({
  courseId,
  module,
  videos,
  onClose,
}: {
  courseId?: string;
  module: ModuleRow | null;
  videos: VideoOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [titleEn, setTitleEn] = useState(module?.titleEn ?? "");
  const [titleId, setTitleId] = useState(module?.titleId ?? "");
  const [videoId, setVideoId] = useState(module?.videoId ?? "");
  const [bodyEn, setBodyEn] = useState(module?.bodyEn ?? "");
  const [bodyId, setBodyId] = useState(module?.bodyId ?? "");
  const [passPct, setPassPct] = useState(String(module?.passPct ?? 80));

  // Direct video upload: the file goes through the SAME pipeline as the
  // Videos page (uploadVideoFile → uploads/video-files/, addUploadedVideo →
  // a type UPLOAD library row), then the new row is selected here. Kept in
  // local state so the combobox can label it before router.refresh() lands.
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<VideoOption[]>([]);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // SCORM package state — "<moduleId>|<launchHref>" mirroring Module.scormPath.
  // Uploads happen against the SAVED module row, so creating a brand-new
  // module shows a hint to save first (the id doesn't exist yet).
  const [scormPath, setScormPath] = useState(module?.scormPath ?? null);
  const [uploadingScorm, setUploadingScorm] = useState(false);
  const scormFileRef = useRef<HTMLInputElement>(null);
  const scormLaunchHref = scormPath?.split("|").slice(1).join("|") || null;

  const videoOptions = [
    { value: "", label: "No video" },
    ...uploadedVideos
      .filter((u) => !videos.some((v) => v.id === u.id))
      .map((v) => ({ value: v.id, label: v.titleEn, description: v.titleId })),
    ...videos.map((v) => ({ value: v.id, label: v.titleEn, description: v.titleId })),
  ];

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await uploadVideoFile(fd);
      if (!up.ok || !up.data) {
        toast.error(!up.ok ? up.error : "Upload failed");
        return;
      }
      // Title from the filename (both languages) — editable later on /videos.
      const stem = file.name.replace(/\.[^.]+$/, "").trim() || "Uploaded video";
      const created = await addUploadedVideo({
        titleEn: stem,
        titleId: stem,
        path: up.data.path,
      });
      if (!created.ok || !created.data) {
        toast.error(!created.ok ? created.error : "Couldn't add the video");
        return;
      }
      const newId = created.data.id;
      setUploadedVideos((prev) => [{ id: newId, titleEn: stem, titleId: stem }, ...prev]);
      setVideoId(newId);
      toast.success("Video uploaded and selected");
      router.refresh();
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleScormUpload(file: File) {
    if (!module) return;
    setUploadingScorm(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await setModuleScorm(module.id, fd);
      if (r.ok && r.data) {
        setScormPath(`${module.id}|${r.data.launchHref}`);
        toast.success("SCORM package attached");
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploadingScorm(false);
    }
  }

  function handleScormRemove() {
    if (!module) return;
    startT(async () => {
      const r = await clearModuleScorm(module.id);
      if (r.ok) {
        setScormPath(null);
        toast.success("SCORM package removed");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function submit() {
    const pct = Number(passPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      toast.error("Pass mark must be a whole number between 0 and 100");
      return;
    }
    const payload = {
      titleEn: titleEn.trim() || null,
      titleId: titleId.trim() || null,
      videoId: videoId || null,
      bodyEn: bodyEn.trim() || null,
      bodyId: bodyId.trim() || null,
      passPct: pct,
    };
    startT(async () => {
      const r = module
        ? await updateModule(module.id, payload)
        : await createModule(courseId ? { courseId, ...payload } : payload);
      if (r.ok) {
        toast.success(module ? "Module saved" : "Module added");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{module ? "Edit module" : "Add module"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="module-title-en">Title (English)</Label>
              <Input
                id="module-title-en"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Pruning side shoots"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="module-title-id">Title (Indonesian)</Label>
              <Input
                id="module-title-id"
                value={titleId}
                onChange={(e) => setTitleId(e.target.value)}
                placeholder="e.g. Memangkas tunas samping"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Fill either language — anything left blank is auto-translated with AI on save.
          </p>
          <div className="space-y-1.5">
            <Label>Teaching video (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Combobox
                  value={videoId}
                  onChange={(v) => setVideoId(v ?? "")}
                  placeholder="No video"
                  options={videoOptions}
                  emptyHint="No videos in the library yet"
                />
              </div>
              <input
                ref={videoFileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleVideoUpload(f);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={uploadingVideo || pending}
                onClick={() => videoFileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadingVideo ? "Uploading…" : "Upload video file"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uploads go into the Videos library (max 200 MB) and are selected here automatically.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="module-body-en">Teaching text — English (optional)</Label>
            <Textarea
              id="module-body-en"
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="module-body-id">Teaching text — Indonesian (optional)</Label>
            <Textarea
              id="module-body-id"
              value={bodyId}
              onChange={(e) => setBodyId(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>SCORM package (optional)</Label>
            {module ? (
              <>
                {scormLaunchHref ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                    <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs" title={scormLaunchHref}>
                      {scormLaunchHref}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={uploadingScorm || pending}
                      onClick={handleScormRemove}
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                ) : null}
                <input
                  ref={scormFileRef}
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleScormUpload(f);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingScorm || pending}
                  onClick={() => scormFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingScorm
                    ? "Uploading…"
                    : scormLaunchHref
                      ? "Replace SCORM package"
                      : "Upload SCORM .zip"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  A SCORM 1.2 .zip (max 150 MB). It plays instead of a quiz — video and
                  teaching text are optional for SCORM modules.
                </p>
              </>
            ) : (
              <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
                Save the module first, then edit it to attach a SCORM package.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="module-pass-pct">Pass mark (%)</Label>
            <Input
              id="module-pass-pct"
              type="number"
              min={0}
              max={100}
              value={passPct}
              onChange={(e) => setPassPct(e.target.value)}
              className="max-w-[8rem]"
            />
            <p className="text-xs text-muted-foreground">
              Minimum score to pass this module and unlock the next one in a course.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || (!titleEn.trim() && !titleId.trim())}
          >
            {module ? "Save module" : "Add module"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
