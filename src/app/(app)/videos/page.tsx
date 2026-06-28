import { Link as LinkIcon, Upload } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { AddYoutubeVideoDialog } from "@/app/(app)/videos/add-youtube-video-dialog";
import { UploadVideoDialog } from "@/app/(app)/videos/upload-video-dialog";
import { VideosBrowser } from "@/app/(app)/videos/videos-browser";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const videos = await prisma.video.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Videos</h1>
          <p className="text-sm text-muted-foreground">
            YouTube, TikTok, Instagram, or your own uploaded files. Search,
            filter by category, switch grid/list.
          </p>
        </div>
        <div className="flex gap-2">
          <AddYoutubeVideoDialog
            trigger={
              <Button variant="outline">
                <LinkIcon className="h-4 w-4" /> Add from URL
              </Button>
            }
          />
          <UploadVideoDialog
            trigger={
              <Button>
                <Upload className="h-4 w-4" /> Upload video
              </Button>
            }
          />
        </div>
      </header>

      <VideosBrowser
        videos={
          videos as {
            id: string;
            titleEn: string;
            titleId: string;
            category: string | null;
            type: "YOUTUBE" | "UPLOAD";
            url: string | null;
            path: string | null;
            thumbnailPath: string | null;
          }[]
        }
      />
    </div>
  );
}
