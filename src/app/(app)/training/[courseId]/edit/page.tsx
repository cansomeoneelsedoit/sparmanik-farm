import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import {
  CourseEditClient,
  type CourseRow,
  type VideoOption,
} from "@/app/(app)/training/[courseId]/edit/edit-client";

export const dynamic = "force-dynamic";

/** Course builder — superuser only (404 for everyone else, like /admin/users). */
export default async function CourseEditPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERUSER") notFound();

  const { courseId } = await params;

  // `select` (not include) so the Bytes image blobs never enter the RSC
  // payload — the client shows them via /api/training/image/... instead.
  const course = (await prisma.course.findFirst({
    where: { id: courseId },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      description: true,
      published: true,
      lessons: {
        orderBy: { rank: "asc" },
        select: {
          id: true,
          rank: true,
          titleEn: true,
          titleId: true,
          videoId: true,
          bodyEn: true,
          bodyId: true,
          imageMime: true,
          passPct: true,
          questions: {
            orderBy: { rank: "asc" },
            select: {
              id: true,
              rank: true,
              type: true,
              promptEn: true,
              promptId: true,
              imageMime: true,
              config: true,
            },
          },
        },
      },
    },
  })) as CourseRow | null;
  if (!course) notFound();

  const videos = (await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, titleEn: true, titleId: true },
  })) as VideoOption[];

  return <CourseEditClient course={course} videos={videos} />;
}
