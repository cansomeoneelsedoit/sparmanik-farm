import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/server/prisma";
import {
  ModuleLibraryClient,
  type LibraryModuleRow,
} from "@/app/(app)/training/modules/modules-client";
import type { VideoOption } from "@/app/(app)/training/module-editor";

export const dynamic = "force-dynamic";

/**
 * The MODULE LIBRARY — every training module in one place, whether it sits in
 * five courses or none (standalone). Superuser only (404 for everyone else,
 * like the course builder).
 */
export default async function ModuleLibraryPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERUSER") notFound();

  // `select` (not include) so the Bytes image blobs never enter the RSC
  // payload — the client shows them via /api/training/image/... instead.
  const modules = (await prisma.module.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      titleEn: true,
      titleId: true,
      videoId: true,
      bodyEn: true,
      bodyId: true,
      imageMime: true,
      scormPath: true,
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
      courses: {
        orderBy: { createdAt: "asc" },
        select: {
          course: { select: { id: true, titleEn: true, published: true } },
        },
      },
    },
  })) as LibraryModuleRow[];

  const videos = (await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, titleEn: true, titleId: true },
  })) as VideoOption[];

  return <ModuleLibraryClient modules={modules} videos={videos} />;
}
