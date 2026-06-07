"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteVideo } from "@/app/(app)/videos/actions";

function parseYoutubeId(url: string): string | null {
  const m1 = url.match(/youtu\.be\/([\w-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([\w-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (m3) return m3[1];
  return null;
}

function parseTiktokId(url: string): string | null {
  const m = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/);
  return m ? m[1] : null;
}

function parseInstagramCode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

type Platform = "youtube" | "tiktok" | "instagram" | "unknown";
function detectUrlPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return "unknown";
}

export function VideoPlayButton({
  id,
  type,
  url,
  path,
}: {
  id: string;
  type: "YOUTUBE" | "UPLOAD";
  url: string | null;
  path?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();

  // Resolve the embed strategy. type=UPLOAD means we have a local file path;
  // type=YOUTUBE is the historical name for any URL-based video so we
  // discriminate further by URL host (YouTube / TikTok / Instagram / other).
  const platform = type === "UPLOAD" ? "upload" : url ? detectUrlPlatform(url) : "unknown";
  const ytId = url && platform === "youtube" ? parseYoutubeId(url) : null;
  const ttId = url && platform === "tiktok" ? parseTiktokId(url) : null;
  const igCode = url && platform === "instagram" ? parseInstagramCode(url) : null;

  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} title="Play">
        <Play className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          startT(async () => {
            await deleteVideo(id);
            router.refresh();
          })
        }
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Play</DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            {platform === "upload" && path ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={`/api/uploads/${path}`} controls className="h-full w-full" autoPlay />
            ) : ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : ttId ? (
              <iframe
                src={`https://www.tiktok.com/embed/v2/${ttId}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : igCode ? (
              <iframe
                src={`https://www.instagram.com/p/${igCode}/embed/`}
                className="h-full w-full"
                scrolling="no"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : url ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-sm text-muted-foreground">
                <span>Can&apos;t embed this URL inline.</span>
                <Button asChild size="sm" variant="outline">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
                No playable source
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
