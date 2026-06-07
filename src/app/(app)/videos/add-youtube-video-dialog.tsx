"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, ImageIcon, RotateCcw, Upload, X } from "lucide-react";

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
  addYoutubeVideo,
  updateYoutubeVideo,
  uploadVideoThumbnail,
} from "@/app/(app)/videos/actions";

const schema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional(),
  url: z.string().url(),
});
type Form = z.infer<typeof schema>;

function parseYoutubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Returns the URL to render the thumbnail at — accepts both absolute
 * (https://i.ytimg.com/...) and relative upload paths (videos/abc.webp).
 */
function thumbnailDisplayUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `/api/uploads/${path}`;
}

export function AddYoutubeVideoDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: {
    id: string;
    titleEn: string;
    titleId: string;
    category: string | null;
    url: string | null;
    thumbnailPath: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [thumbPath, setThumbPath] = useState<string | null>(existing?.thumbnailPath ?? null);
  const [uploading, setUploading] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          titleEn: existing.titleEn,
          titleId: existing.titleId,
          category: existing.category ?? "",
          url: existing.url ?? "",
        }
      : undefined,
  });

  const watchedUrl = form.watch("url") ?? "";
  const ytId = parseYoutubeId(watchedUrl);
  // Is the currently-displayed thumbnail the YouTube auto-fetched one
  // (or a custom upload we should let the user remove)?
  const isCustom = !!thumbPath && !thumbPath.startsWith("http");
  const previewUrl = thumbnailDisplayUrl(thumbPath) ?? (
    ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null
  );

  async function uploadBlob(blob: Blob, filename: string) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], filename, { type: blob.type || "image/png" }));
      const r = await uploadVideoThumbnail(fd);
      if (r.ok && r.data) {
        setThumbPath(r.data.path);
        toast.success("Thumbnail saved");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleFileSelect(file: File) {
    await uploadBlob(file, file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Capture a single frame from a YouTube video as a thumbnail. We can't
   * load YouTube into a <video> directly (CORS), so this only runs when
   * the user has uploaded a video file (UPLOAD type). For YouTube videos
   * the auto-fetched poster is the only frame option.
   *
   * For YT-style videos we surface high-res YouTube thumbs (`hqdefault`,
   * `sddefault`, `maxresdefault`) as quick-pick options instead.
   */
  async function pickYtThumb(variant: "default" | "hq" | "sd" | "max") {
    if (!ytId) return;
    const map = {
      default: "mqdefault.jpg",
      hq: "hqdefault.jpg",
      sd: "sddefault.jpg",
      max: "maxresdefault.jpg",
    };
    const url = `https://i.ytimg.com/vi/${ytId}/${map[variant]}`;
    setGrabbing(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        toast.error("That YouTube thumbnail isn't available");
        return;
      }
      const blob = await res.blob();
      await uploadBlob(blob, `yt-${variant}.jpg`);
    } catch {
      toast.error("Couldn't fetch that variant");
    } finally {
      setGrabbing(false);
    }
  }

  function onSubmit(v: Form) {
    startT(async () => {
      const payload = { ...v, thumbnailPath: thumbPath };
      const r = isEdit
        ? await updateYoutubeVideo(existing.id, payload)
        : await addYoutubeVideo(payload);
      if (r.ok) {
        toast.success(isEdit ? "Saved" : "Video added");
        setOpen(false);
        if (!isEdit) {
          form.reset();
          setThumbPath(null);
        }
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
            <DialogTitle>{isEdit ? "Edit video" : "Add video from URL"}</DialogTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              YouTube, TikTok, and Instagram links all work — paste any of them
              into the URL field below.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Title (EN)</Label><Input {...form.register("titleEn")} /></div>
              <div className="space-y-2"><Label>Title (ID)</Label><Input {...form.register("titleId")} /></div>
            </div>
            <div className="space-y-2"><Label>Category</Label><Input {...form.register("category")} /></div>
            <div className="space-y-2">
              <Label>Video URL</Label>
              <Input
                {...form.register("url")}
                placeholder="https://youtu.be/… or https://tiktok.com/@user/video/… or https://instagram.com/p/…"
              />
            </div>

            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <div className="flex gap-3">
                <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                  {isCustom ? (
                    <button
                      type="button"
                      onClick={() => setThumbPath(null)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm hover:bg-background"
                      title="Use YouTube default"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || grabbing || pending}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Uploading…" : "Upload image"}
                  </Button>
                  {ytId ? (
                    <div className="grid grid-cols-3 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => pickYtThumb("hq")}
                        disabled={uploading || grabbing || pending}
                        className="h-7 text-[10px]"
                        title="YouTube high-quality thumbnail"
                      >
                        <Camera className="h-3 w-3" /> HQ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => pickYtThumb("sd")}
                        disabled={uploading || grabbing || pending}
                        className="h-7 text-[10px]"
                        title="YouTube standard-def thumbnail"
                      >
                        <Camera className="h-3 w-3" /> SD
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => pickYtThumb("max")}
                        disabled={uploading || grabbing || pending}
                        className="h-7 text-[10px]"
                        title="YouTube max-res thumbnail (if available)"
                      >
                        <Camera className="h-3 w-3" /> MAX
                      </Button>
                    </div>
                  ) : null}
                  {isCustom ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setThumbPath(null)}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset to default
                    </Button>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground">
                    Upload your own JPG/PNG/WebP, or grab the YouTube poster at
                    a different size. Auto-resized + WebP-encoded.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFileSelect(f);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
