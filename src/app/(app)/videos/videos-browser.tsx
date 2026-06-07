"use client";

import { useMemo, useState } from "react";
import { Grid3x3, List, Pencil, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LocalizedTextClient as LocalizedText } from "@/components/shared/localized-text-client";
import { AddYoutubeVideoDialog } from "@/app/(app)/videos/add-youtube-video-dialog";
import { VideoPlayButton } from "@/app/(app)/videos/video-play-button";
import { cn } from "@/lib/utils";

export type VideoRow = {
  id: string;
  titleEn: string;
  titleId: string;
  category: string | null;
  type: "YOUTUBE" | "UPLOAD";
  url: string | null;
  path: string | null;
  thumbnailPath: string | null;
};

function detectSourceBadge(url: string | null, type: "YOUTUBE" | "UPLOAD"): string {
  if (type === "UPLOAD") return "Upload";
  if (!url) return "—";
  const u = url.toLowerCase();
  if (u.includes("youtu")) return "YouTube";
  if (u.includes("tiktok")) return "TikTok";
  if (u.includes("instagram")) return "Instagram";
  return "Link";
}

export function VideosBrowser({ videos }: { videos: VideoRow[] }) {
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const v of videos) if (v.category) s.add(v.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [videos]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return videos.filter((v) => {
      if (activeCat && v.category !== activeCat) return false;
      if (!needle) return true;
      return (
        v.titleEn.toLowerCase().includes(needle) ||
        v.titleId.toLowerCase().includes(needle) ||
        (v.category ?? "").toLowerCase().includes(needle)
      );
    });
  }, [videos, q, activeCat]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search videos by title or category…"
            className="pl-8"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs",
              view === "grid"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            title="Grid view"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "rounded-sm px-2 py-1 text-xs",
              view === "list"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition",
              activeCat === null
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-accent/60",
            )}
          >
            All ({videos.length})
          </button>
          {categories.map((c) => {
            const n = videos.filter((v) => v.category === c).length;
            const on = activeCat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(on ? null : c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  on
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-accent/60",
                )}
              >
                {c} ({n})
              </button>
            );
          })}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {videos.length === 0 ? "No videos yet." : "No videos match your search."}
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const thumbSrc = v.thumbnailPath
              ? v.thumbnailPath.startsWith("http")
                ? v.thumbnailPath
                : `/api/uploads/${v.thumbnailPath}`
              : null;
            const sourceBadge = detectSourceBadge(v.url, v.type);
            return (
              <Card key={v.id} className="overflow-hidden">
                <div className="relative">
                  {thumbSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                      Video
                    </div>
                  )}
                  <Badge variant="secondary" className="absolute left-2 top-2 text-[10px]">
                    {sourceBadge}
                  </Badge>
                </div>
                <CardContent className="space-y-2 p-4">
                  <div className="font-medium">
                    <LocalizedText en={v.titleEn} id={v.titleId} />
                  </div>
                  <div className="flex items-center justify-between">
                    {v.category ? <Badge variant="outline">{v.category}</Badge> : <span />}
                    <div className="flex items-center gap-1">
                      {v.type === "YOUTUBE" ? (
                        <AddYoutubeVideoDialog
                          existing={{
                            id: v.id,
                            titleEn: v.titleEn,
                            titleId: v.titleId,
                            category: v.category,
                            url: v.url,
                            thumbnailPath: v.thumbnailPath,
                          }}
                          trigger={
                            <Button size="icon" variant="ghost" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                      ) : null}
                      <VideoPlayButton id={v.id} type={v.type} url={v.url} path={v.path} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {filtered.map((v) => {
                const thumbSrc = v.thumbnailPath
                  ? v.thumbnailPath.startsWith("http")
                    ? v.thumbnailPath
                    : `/api/uploads/${v.thumbnailPath}`
                  : null;
                const sourceBadge = detectSourceBadge(v.url, v.type);
                return (
                  <li key={v.id} className="flex items-center gap-3 p-3">
                    {thumbSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbSrc}
                        alt=""
                        className="h-14 w-24 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        Video
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        <LocalizedText en={v.titleEn} id={v.titleId} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">
                          {sourceBadge}
                        </Badge>
                        {v.category ? (
                          <Badge variant="outline" className="text-[10px]">
                            {v.category}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {v.type === "YOUTUBE" ? (
                        <AddYoutubeVideoDialog
                          existing={{
                            id: v.id,
                            titleEn: v.titleEn,
                            titleId: v.titleId,
                            category: v.category,
                            url: v.url,
                            thumbnailPath: v.thumbnailPath,
                          }}
                          trigger={
                            <Button size="icon" variant="ghost" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                      ) : null}
                      <VideoPlayButton id={v.id} type={v.type} url={v.url} path={v.path} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {videos.length}
      </div>
    </div>
  );
}
