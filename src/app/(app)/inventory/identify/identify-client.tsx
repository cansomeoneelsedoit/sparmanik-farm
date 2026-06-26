"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Eye, ImagePlus, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { identifyItemImage } from "@/app/(app)/inventory/identify/actions";

type Match = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  photoPath: string | null;
  confidence: number;
  reason: string;
  source: "ai" | "keyword";
};

type IdentifyResult = {
  saw: string;
  keywords: string[];
  matches: Match[];
};

/**
 * Camera + upload entry points, an inline preview, the match list, and a
 * keyword-search fallback for when AI matches are weak or empty. The
 * upload image is processed and discarded; nothing is persisted.
 */
export function IdentifyClient() {
  const [candidate, setCandidate] = useState<{ file: File; preview: string } | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(file: File) {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate({ file, preview: URL.createObjectURL(file) });
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function clear() {
    if (candidate) URL.revokeObjectURL(candidate.preview);
    setCandidate(null);
    setResult(null);
  }

  async function runIdentify() {
    if (!candidate) return;
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append("file", candidate.file);
      const r = await identifyItemImage(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const res = r.data ?? { saw: "", keywords: [], matches: [] };
      setResult(res);
      const strong = res.matches.filter((m) => m.confidence >= 0.7).length;
      const plausible = res.matches.filter((m) => m.confidence >= 0.4 && m.confidence < 0.7).length;
      if (strong > 0) {
        toast.success(`Found ${strong} strong match${strong === 1 ? "" : "es"}`);
      } else if (plausible > 0) {
        toast.message(`${plausible} plausible match${plausible === 1 ? "" : "es"} — verify visually`);
      } else if (res.matches.length > 0) {
        toast.message("Only weak guesses. Try a clearer photo or search manually below.");
      } else {
        toast.message("No matches. Try a clearer photo or search manually below.");
      }
    } finally {
      setWorking(false);
    }
  }

  // Group by confidence tier so the UI lets the user instantly see how
  // sure the system is.
  const strong = result?.matches.filter((m) => m.confidence >= 0.7) ?? [];
  const plausible = result?.matches.filter((m) => m.confidence >= 0.4 && m.confidence < 0.7) ?? [];
  const weak = result?.matches.filter((m) => m.confidence < 0.4) ?? [];

  return (
    <div className="space-y-6">
      {/* Capture / upload entry */}
      {!candidate ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="font-serif text-xl">What is this thing?</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Hold up the item, snap a photo. Or upload an existing photo,
                a supplier listing, even a label. We&apos;ll find the closest
                matches in your inventory.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => cameraInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> Take photo
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Choose file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidate.preview}
                alt="Item preview"
                className="h-40 w-40 shrink-0 rounded-md border object-cover"
              />
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium">Ready to identify</div>
                <p className="text-xs text-muted-foreground">
                  Looks good? Hit <strong>Identify</strong> — the photo is
                  sent to AI vision once, matched against every item in your
                  inventory, and discarded. Nothing gets saved.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runIdentify} disabled={working}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {working ? "Looking…" : "Identify"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={working}
                  >
                    <Camera className="h-3.5 w-3.5" /> Retake
                  </Button>
                  <Button variant="ghost" onClick={clear} disabled={working}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* "What I saw" — surfaces the AI's interpretation even when no
          match is confident, so the user knows the photo was understood. */}
      {result ? (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-accent" />
              AI sees:
            </div>
            <p className="text-sm">{result.saw}</p>
            {result.keywords.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Keywords:</span>
                {result.keywords.map((k) => (
                  <Link
                    key={k}
                    href={`/inventory?q=${encodeURIComponent(k)}`}
                    className="rounded-full border bg-background px-2 py-0.5 transition hover:border-accent hover:text-foreground"
                    title={`Search inventory for "${k}"`}
                  >
                    {k}
                  </Link>
                ))}
                <Link
                  href={`/inventory?q=${encodeURIComponent(result.keywords.join(" "))}`}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                >
                  <Search className="h-3 w-3" />
                  Search inventory
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Match list, grouped by tier */}
      {result ? (
        result.matches.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing in your inventory matched. Try clearer photo, a tighter
                shot, or click a keyword above to search manually.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {strong.length > 0 ? (
              <MatchSection title="Strong matches" tone="strong" matches={strong} />
            ) : null}
            {plausible.length > 0 ? (
              <MatchSection title="Plausible matches" tone="plausible" matches={plausible} />
            ) : null}
            {weak.length > 0 ? (
              <MatchSection title="Weak guesses (verify visually)" tone="weak" matches={weak} />
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              Match source: <Badge variant="outline" className="text-[9px]">AI</Badge> means
              the AI returned this from your catalogue.{" "}
              <Badge variant="outline" className="text-[9px]">Keyword</Badge> means it was
              found locally by searching for the keywords above — surfaced when AI was
              uncertain.
            </p>
          </div>
        )
      ) : null}

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelect(f);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelect(f);
        }}
      />
    </div>
  );
}

function MatchSection({
  title,
  tone,
  matches,
}: {
  title: string;
  tone: "strong" | "plausible" | "weak";
  matches: Match[];
}) {
  const tones = {
    strong: "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20",
    plausible: "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20",
    weak: "border-slate-300 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-900/40",
  };
  const headingTones = {
    strong: "text-emerald-700 dark:text-emerald-300",
    plausible: "text-amber-700 dark:text-amber-300",
    weak: "text-slate-600 dark:text-slate-400",
  };
  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-semibold uppercase tracking-wider", headingTones[tone])}>
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {matches.map((m) => (
          <Link key={m.id} href={`/inventory/${m.id}`}>
            <Card className={cn("transition hover:shadow-md", tones[tone])}>
              <CardContent className="flex gap-3 p-3">
                {m.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/uploads/${m.photoPath}`}
                    alt={m.name}
                    className="h-20 w-20 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                      {m.code}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {(m.confidence * 100).toFixed(0)}%
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      {m.source === "ai" ? "AI" : "Keyword"}
                    </Badge>
                  </div>
                  <div className="line-clamp-1 font-medium">{m.name}</div>
                  {m.category ? (
                    <div className="text-xs text-muted-foreground">{m.category}</div>
                  ) : null}
                  {m.reason ? (
                    <div className="line-clamp-2 text-xs text-muted-foreground">{m.reason}</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
