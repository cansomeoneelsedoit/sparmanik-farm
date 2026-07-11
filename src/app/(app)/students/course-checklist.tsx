"use client";

import { Badge } from "@/components/ui/badge";
import type { CourseOption } from "@/app/(app)/students/students-client";

/**
 * Checkbox list of courses, shared by the add-student and assign-courses
 * dialogs. Draft (unpublished) courses get a tag so Boyd knows they aren't
 * live yet. Uses the app's native-checkbox pattern (no Checkbox primitive).
 */
export function CourseChecklist({
  courses,
  selected,
  onToggle,
  disabled,
}: {
  courses: CourseOption[];
  selected: string[];
  onToggle: (courseId: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  if (courses.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No courses yet — create one under Training first.
      </p>
    );
  }
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
      {courses.map((c) => (
        <label
          key={c.id}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
        >
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-primary"
            checked={selected.includes(c.id)}
            disabled={disabled}
            onChange={(e) => onToggle(c.id, e.target.checked)}
          />
          <span className="min-w-0 flex-1 truncate">{c.title}</span>
          {!c.published ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Draft
            </Badge>
          ) : null}
        </label>
      ))}
    </div>
  );
}
