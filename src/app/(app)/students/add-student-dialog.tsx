"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStudent, type StudentCredentials } from "@/app/(app)/students/actions";
import { CourseChecklist } from "@/app/(app)/students/course-checklist";
import { CredentialsReveal } from "@/app/(app)/students/credentials-reveal";
import type { CourseOption } from "@/app/(app)/students/students-client";

/**
 * Onboard a student: name (required), optional email/phone, and the courses to
 * assign. On success we DON'T just close — the returned one-time credentials
 * are shown inline so Boyd can copy / WhatsApp them before they're gone.
 */
export function AddStudentDialog({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creds, setCreds] = useState<StudentCredentials | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setSelected([]);
    setCreds(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function toggle(courseId: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...prev, courseId] : prev.filter((id) => id !== courseId),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    startT(async () => {
      const r = await createStudent({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        courseIds: selected,
      });
      if (r.ok && r.data) {
        setCreds(r.data);
        toast.success("Student added");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  function done() {
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add student
      </Button>
      <DialogContent>
        {creds ? (
          <>
            <DialogHeader>
              <DialogTitle>{creds.name} is ready</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <CredentialsReveal credentials={creds} />
            </div>
            <DialogFooter>
              <Button onClick={done}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add student</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="student-name">Name</Label>
                <Input
                  id="student-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-email">Email</Label>
                <Input
                  id="student-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank if they have no email; we&apos;ll make a login for them.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-phone">Phone</Label>
                <Input
                  id="student-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812…"
                />
                <p className="text-xs text-muted-foreground">
                  For sending their login over WhatsApp.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Assign courses</Label>
                <CourseChecklist
                  courses={courses}
                  selected={selected}
                  onToggle={toggle}
                  disabled={pending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add student"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
