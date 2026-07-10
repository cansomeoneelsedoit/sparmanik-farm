"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Friendly paywall card for a PRICED course. Render it on the course page
 * (and the player, if desired) for any course with priceIdr > 0:
 *
 *   <CourseAccessNotice
 *     courseId={course.id}
 *     priceIdrLabel="150.000"          // pre-formatted number, no "Rp"
 *     enrolled={hasEnrollmentRow}
 *     isPrivileged={isSuperuser}
 *   />
 *
 * Enrolled or privileged viewers see nothing — the card only shows to people
 * the server-side gate (isEnrolledOrFree / submitModuleAttempt) will block
 * anyway; it just tells them WHY and what to do about it.
 */
export function CourseAccessNotice({
  courseId,
  priceIdrLabel,
  enrolled,
  isPrivileged,
}: {
  courseId: string;
  priceIdrLabel: string;
  enrolled: boolean;
  isPrivileged: boolean;
}) {
  const t = useTranslations("training");
  if (enrolled || isPrivileged) return null;
  return (
    <Card data-course-id={courseId} className="border-accent/60 bg-accent/10">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-foreground">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{t("paidCourseTitle")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("paidCourseBody", { price: priceIdrLabel })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
