"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setStudentCourses } from "@/app/(app)/students/actions";
import { CourseChecklist } from "@/app/(app)/students/course-checklist";
import type { CourseOption } from "@/app/(app)/students/students-client";

/**
 * Edit which courses a student can see. Prefilled with their current
 * assignments; Save syncs to exactly the ticked set. Mounted only while open
 * (parent passes a non-null student) so it resets each time.
 */
export function AssignCoursesDialog({
  student,
  courses,
  onClose,
}: {
  student: { id: string; name: string; courseIds: string[] };
  courses: CourseOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [selected, setSelected] = useState<string[]>(student.courseIds);

  function toggle(courseId: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...prev, courseId] : prev.filter((id) => id !== courseId),
    );
  }

  function save() {
    startT(async () => {
      const r = await setStudentCourses({ studentId: student.id, courseIds: selected });
      if (r.ok) {
        toast.success("Courses updated");
        onClose();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign courses</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">
            Choose which courses {student.name || "this student"} can open in the portal.
          </p>
          <CourseChecklist
            courses={courses}
            selected={selected}
            onToggle={toggle}
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
