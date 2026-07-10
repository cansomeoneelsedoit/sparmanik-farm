"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScormPlayer } from "@/app/(app)/training/scorm-player";

/**
 * Client shell around ScormPlayer for the module page: the completion
 * callback can't cross the server-component boundary, so this owns it —
 * refreshes the route (progress + lock state re-derive server-side) and
 * surfaces the next-module / back-to-course buttons once the SCO passes.
 */
export function ScormSection({
  courseId,
  moduleId,
  launchUrl,
  studentId,
  studentName,
  body,
  nextModuleHref,
  courseHref,
}: {
  courseId: string;
  moduleId: string;
  launchUrl: string;
  studentId: string;
  studentName: string;
  body: string | null;
  nextModuleHref: string | null;
  courseHref: string;
}) {
  const router = useRouter();
  const t = useTranslations("training");
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  return (
    <div className="space-y-4">
      {body ? (
        <Card>
          <CardContent className="space-y-4 p-6 text-base leading-relaxed">
            {body.split(/\n+/).map((para, i) => (para.trim() ? <p key={i}>{para}</p> : null))}
          </CardContent>
        </Card>
      ) : null}

      <ScormPlayer
        courseId={courseId}
        moduleId={moduleId}
        launchUrl={launchUrl}
        studentId={studentId}
        studentName={studentName}
        onComplete={(r) => {
          setResult(r);
          router.refresh();
        }}
      />

      {result?.passed ? (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              {t("scormComplete", { score: result.score })}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={courseHref}>{t("backToCourse")}</Link>
              </Button>
              {nextModuleHref ? (
                <Button asChild size="sm">
                  <Link href={nextModuleHref}>
                    {t("nextModule")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
