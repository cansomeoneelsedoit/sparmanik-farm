"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteVideo } from "@/app/(app)/videos/actions";

function parseYoutubeId(url: string): string | null {
  const m1 = url.match(/youtu\.be\/([\w-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([\w-]{11})/);
  if (m2) return m2[1];
  return null;
}

export function VideoPlayButton({ id, type, url }: { id: string; type: "YOUTUBE" | "UPLOAD"; url: string | null }) {
  const [open, setOpen] = useState(false);
  const [, startT] = useTransition();
  const router = useRouter();
  const ytId = type === "YOUTUBE" && url ? parseYoutubeId(url) : null;

  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}><Play className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => startT(async () => { await deleteVideo(id); router.refresh(); })}><Trash2 className="h-4 w-4" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Play</DialogTitle></DialogHeader>
          <div className="aspect-video w-full">
            {ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">No playable source</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
