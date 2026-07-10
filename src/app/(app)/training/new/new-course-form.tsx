"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCourse } from "@/app/(app)/training/actions";

export function NewCourseForm() {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [titleEn, setTitleEn] = useState("");
  const [titleId, setTitleId] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startT(async () => {
          const r = await createCourse({
            titleEn: titleEn.trim(),
            titleId: titleId.trim(),
            description: description.trim() || null,
          });
          if (r.ok && r.data) {
            toast.success("Course created");
            router.push(`/training/${r.data.id}/edit`);
          } else if (!r.ok) {
            toast.error(r.error);
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="course-title-en">Title (English)</Label>
        <Input
          id="course-title-en"
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          placeholder="e.g. Melon greenhouse basics"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-title-id">Title (Indonesian)</Label>
        <Input
          id="course-title-id"
          value={titleId}
          onChange={(e) => setTitleId(e.target.value)}
          placeholder="e.g. Dasar-dasar greenhouse melon"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-description">Description (optional)</Label>
        <Textarea
          id="course-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What staff will learn in this course"
          rows={3}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !titleEn.trim() || !titleId.trim()}>
          Create course
        </Button>
      </div>
    </form>
  );
}
