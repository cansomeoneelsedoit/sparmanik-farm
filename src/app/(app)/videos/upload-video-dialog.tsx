"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Film, Upload, X } from "lucide-react";

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
import {
  addUploadedVideo,
  uploadVideoFile,
  uploadVideoThumbnail,
} from "@/app/(app)/videos/actions";

const schema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional(),
});
type Form = z.infer<typeof schema>;

/**
 * Lets the user upload their own video file (mp4, mov, webm) and optionally
 * pick a thumbnail. The thumbnail input also offers "Grab current frame" if
 * the video has been chosen + decoded by the browser — uses an offscreen
 * canvas to capture a frame and upload it through the existing image
 * pipeline.
 */
export function UploadVideoDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // local blob URL for frame grab
  const [thumbPath, setThumbPath] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const videoFileInput = useRef<HTMLInputElement>(null);
  const thumbFileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { titleEn: "", titleId: "", category: "" },
  });

  async function handleVideoSelect(file: File) {
    setUploadingVideo(true);
    setVideoUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadVideoFile(fd);
      if (r.ok && r.data) {
        setVideoPath(r.data.path);
        toast.success("Video uploaded");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleThumbSelect(file: File) {
    setUploadingThumb(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadVideoThumbnail(fd);
      if (r.ok && r.data) {
        setThumbPath(r.data.path);
        toast.success("Thumbnail uploaded");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploadingThumb(false);
    }
  }

  async function grabFrame() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (v.readyState < 2) {
      toast.error("Wait for the video to load first");
      return;
    }
    setGrabbing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast.error("Browser can't draw the frame");
        return;
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      );
      if (!blob) {
        toast.error("Couldn't capture frame");
        return;
      }
      const fd = new FormData();
      fd.append("file", new File([blob], "frame.jpg", { type: "image/jpeg" }));
      const r = await uploadVideoThumbnail(fd);
      if (r.ok && r.data) {
        setThumbPath(r.data.path);
        toast.success("Frame captured as thumbnail");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setGrabbing(false);
    }
  }

  function onSubmit(v: Form) {
    if (!videoPath) {
      toast.error("Pick a video file first");
      return;
    }
    startT(async () => {
      const r = await addUploadedVideo({ ...v, path: videoPath, thumbnailPath: thumbPath });
      if (r.ok) {
        toast.success("Video added");
        setOpen(false);
        form.reset();
        setVideoPath(null);
        setVideoUrl(null);
        setThumbPath(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Upload a video</DialogTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              Your own mp4 / mov / webm. Max 200 MB. Pick a custom thumbnail or
              grab any frame from the video itself.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Video file</Label>
              {videoUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="aspect-video w-full rounded-md border bg-black"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setVideoUrl(null);
                      setVideoPath(null);
                    }}
                    disabled={uploadingVideo || pending}
                  >
                    <X className="h-3 w-3" /> Remove
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoFileInput.current?.click()}
                  disabled={uploadingVideo}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <Film className="h-6 w-6" />
                  <span>{uploadingVideo ? "Uploading…" : "Click to choose a video file"}</span>
                  <span className="text-[10px]">mp4 / mov / webm — up to 200 MB</span>
                </button>
              )}
              <input
                ref={videoFileInput}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleVideoSelect(f);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Title (EN)</Label>
                <Input {...form.register("titleEn")} />
              </div>
              <div className="space-y-2">
                <Label>Title (ID)</Label>
                <Input {...form.register("titleId")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input {...form.register("category")} />
            </div>

            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <div className="flex gap-3">
                <div className="aspect-video w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {thumbPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/uploads/${thumbPath}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Camera className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => thumbFileInput.current?.click()}
                    disabled={uploadingThumb || grabbing || pending}
                  >
                    <Upload className="h-3 w-3" /> Upload image
                  </Button>
                  {videoUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={grabFrame}
                      disabled={uploadingThumb || grabbing || pending}
                    >
                      <Camera className="h-3 w-3" />
                      {grabbing ? "Capturing…" : "Grab current frame"}
                    </Button>
                  ) : null}
                  {thumbPath ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setThumbPath(null)}
                      disabled={uploadingThumb || grabbing || pending}
                      className="text-xs"
                    >
                      <X className="h-3 w-3" /> Remove
                    </Button>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground">
                    Use the player above to scrub to the frame you want, then
                    hit Grab current frame.
                  </p>
                </div>
                <input
                  ref={thumbFileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleThumbSelect(f);
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !videoPath}>
              {pending ? "Saving…" : "Add video"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
