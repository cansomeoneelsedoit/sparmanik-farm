"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteStudent,
  resendStudentLogin,
  type StudentCredentials,
} from "@/app/(app)/students/actions";
import { AssignCoursesDialog } from "@/app/(app)/students/assign-courses-dialog";
import { CredentialsReveal } from "@/app/(app)/students/credentials-reveal";

export type CourseOption = {
  id: string;
  /** English title, falling back to the Indonesian one. */
  title: string;
  published: boolean;
};

export type StudentRow = {
  id: string;
  name: string;
  /** The `email` field they sign in with (may be a synthetic address). */
  loginEmail: string;
  /** True when the login is an auto-generated (email-less) address. */
  isSynthetic: boolean;
  phone: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  courseIds: string[];
  coursesAssigned: number;
  coursesComplete: number;
};

const chip =
  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground";

function CoursesChips({ ids, titleById }: { ids: string[]; titleById: Map<string, string> }) {
  if (ids.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <span key={id} className={chip}>
          {titleById.get(id) ?? "Unknown course"}
        </span>
      ))}
    </div>
  );
}

function Progress({ assigned, complete }: { assigned: number; complete: number }) {
  if (assigned === 0) return <span className="text-sm text-muted-foreground">Not assigned</span>;
  const pct = Math.round((complete / assigned) * 100);
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">
        {complete}/{assigned} courses done
      </div>
      <div className="h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Login({ s }: { s: StudentRow }) {
  return (
    <div className="space-y-1">
      {s.isSynthetic ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm">{s.phone ?? "No email"}</span>
          <Badge variant="secondary" className="text-[10px]">
            auto login
          </Badge>
        </div>
      ) : (
        <span className="font-mono text-xs">{s.loginEmail}</span>
      )}
      {s.mustChangePassword ? (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          hasn&apos;t set password yet
        </span>
      ) : null}
    </div>
  );
}

export function StudentsClient({
  students,
  courses,
}: {
  students: StudentRow[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<StudentRow | null>(null);
  const [revealCreds, setRevealCreds] = useState<StudentCredentials | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StudentRow | null>(null);

  const titleById = useMemo(
    () => new Map(courses.map((c) => [c.id, c.title])),
    [courses],
  );

  function resend(s: StudentRow) {
    setBusyId(s.id);
    startT(async () => {
      const r = await resendStudentLogin(s.id);
      setBusyId(null);
      if (r.ok && r.data) {
        setRevealCreds(r.data);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    setBusyId(target.id);
    startT(async () => {
      const r = await deleteStudent(target.id);
      setBusyId(null);
      if (r.ok) {
        toast.success(`Removed ${target.name || "student"}`);
        setRemoveTarget(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function RowActions({ s }: { s: StudentRow }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending && busyId === s.id} title="Actions">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAssignTarget(s)}>
            <GraduationCap className="h-4 w-4" /> Assign courses
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => resend(s)}>
            <RotateCcw className="h-4 w-4" /> Resend login
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setRemoveTarget(s)}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-3">
      {students.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          No students yet. Use <span className="font-medium text-foreground">Add student</span> to
          give someone a login to the learning portal.
        </div>
      ) : (
        <>
          {/* Desktop table; card list below lg (tablet/phone). */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Login</th>
                  <th className="px-4 py-2.5 font-medium">Assigned courses</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name || "—"}</td>
                    <td className="px-4 py-3">
                      <Login s={s} />
                    </td>
                    <td className="px-4 py-3">
                      <CoursesChips ids={s.courseIds} titleById={titleById} />
                    </td>
                    <td className="px-4 py-3">
                      <Progress assigned={s.coursesAssigned} complete={s.coursesComplete} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActions s={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y rounded-xl border bg-card lg:hidden">
            {students.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-2">
                  <div className="font-medium">{s.name || "—"}</div>
                  <Login s={s} />
                  <CoursesChips ids={s.courseIds} titleById={titleById} />
                  <Progress assigned={s.coursesAssigned} complete={s.coursesComplete} />
                </div>
                <div className="shrink-0">
                  <RowActions s={s} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Assign courses */}
      {assignTarget ? (
        <AssignCoursesDialog
          student={{
            id: assignTarget.id,
            name: assignTarget.name,
            courseIds: assignTarget.courseIds,
          }}
          courses={courses}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}

      {/* New credentials after a resend */}
      <Dialog
        open={Boolean(revealCreds)}
        onOpenChange={(o) => {
          if (!o) setRevealCreds(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New login{revealCreds ? ` for ${revealCreds.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {revealCreds ? <CredentialsReveal credentials={revealCreds} /> : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealCreds(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => {
          if (!o && !pending) setRemoveTarget(null);
        }}
      >
        <DialogContent className={cn("sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle>Remove student?</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            This deletes{" "}
            <span className="font-medium text-foreground">
              {removeTarget?.name || "this student"}
            </span>
            &apos;s login, their course access and their quiz attempts. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveTarget(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmRemove}
              disabled={pending}
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
