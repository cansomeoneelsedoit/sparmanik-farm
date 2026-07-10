import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewCourseForm } from "@/app/(app)/training/new/new-course-form";

export const dynamic = "force-dynamic";

/** Builder entry point — superuser only, like the settings pages. */
export default async function NewCoursePage() {
  const session = await auth();
  // 404 rather than leaking that the route exists (same as /admin/users).
  if (!session?.user || session.user.role !== "SUPERUSER") notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/training"><ArrowLeft className="h-4 w-4" /> Training</Link>
        </Button>
        <h1 className="font-serif text-3xl">New course</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course details</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Create the course first, then add modules and questions in the
            builder — new or reused from the module library. Staff only see
            it once you publish.
          </p>
        </CardHeader>
        <CardContent>
          <NewCourseForm />
        </CardContent>
      </Card>
    </div>
  );
}
