import { Plus, Pencil } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalizedText } from "@/components/shared/localized-text";
import { AddYoutubeVideoDialog } from "@/app/(app)/videos/add-youtube-video-dialog";
import { VideoPlayButton } from "@/app/(app)/videos/video-play-button";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const videos = await prisma.video.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Videos</h1>
        <AddYoutubeVideoDialog trigger={<Button><Plus className="h-4 w-4" /> Add YouTube</Button>} />
      </header>

      {videos.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No videos yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(videos as { id: string; titleEn: string; titleId: string; category: string | null; type: "YOUTUBE" | "UPLOAD"; url: string | null; thumbnailPath: string | null }[]).map((v) => (
            <Card key={v.id} className="overflow-hidden">
              {v.thumbnailPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailPath} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">Video</div>
              )}
              <CardContent className="space-y-2 p-4">
                <div className="font-medium">
                  <LocalizedText en={v.titleEn} id={v.titleId} />
                </div>
                <div className="flex items-center justify-between">
                  {v.category ? <Badge variant="outline">{v.category}</Badge> : <span />}
                  <div className="flex items-center gap-1">
                    {v.type === "YOUTUBE" ? (
                      <AddYoutubeVideoDialog
                        existing={{ id: v.id, titleEn: v.titleEn, titleId: v.titleId, category: v.category, url: v.url }}
                        trigger={<Button size="icon" variant="ghost" title="Edit"><Pencil className="h-4 w-4" /></Button>}
                      />
                    ) : null}
                    <VideoPlayButton id={v.id} type={v.type} url={v.url} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
