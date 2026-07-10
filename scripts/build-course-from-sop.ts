/**
 * One-off CLI twin of createCourseFromSop (sops/course-actions.ts): turn an
 * SOP into a DRAFT training course — one module per SOP step, 3 AI-drafted
 * questions each (a failed draft leaves a content-only module). Exists so a
 * booklet-sized course can be built headless; the in-app "Build course"
 * button is the normal path.
 *
 *   docker compose exec -T web npx tsx scripts/build-course-from-sop.ts <sopId>
 *
 * CLI has no request context, so every org-scoped create passes the org id
 * explicitly (same pattern as ingest-sop-pdf.ts).
 */
import { prisma } from "../src/server/prisma";
import { draftQuiz } from "../src/server/quiz-draft";

async function main() {
  const sopId = process.argv[2];
  if (!sopId) throw new Error("Usage: tsx scripts/build-course-from-sop.ts <sopId>");

  // CLI has no request context, so the SOP resolves regardless of org. The new
  // course MUST inherit the SOP's own org — stamping a global "first org" would
  // place org B's SOP content inside org A (cross-org leak, review finding).
  const sop = (await prisma.sop.findFirst({
    where: { id: sopId },
    include: { steps: { orderBy: { position: "asc" } } },
  })) as {
    id: string;
    organizationId: string | null;
    titleEn: string;
    titleId: string;
    descriptionEn: string | null;
    steps: { position: number; bodyEn: string; bodyId: string }[];
  } | null;
  if (!sop) throw new Error(`SOP ${sopId} not found`);
  if (!sop.organizationId) throw new Error(`SOP ${sopId} has no organization — cannot build a course.`);
  if (sop.steps.length === 0) throw new Error("This SOP has no steps.");
  const orgId = sop.organizationId;

  const existing = await prisma.course.findFirst({
    where: { titleId: sop.titleId, organizationId: orgId },
  });
  if (existing) throw new Error(`A course titled "${sop.titleId}" already exists (${existing.id}) — aborting.`);

  console.log(`[course] "${sop.titleEn}" — drafting questions for ${sop.steps.length} steps…`);
  const drafted: { bodyEn: string; bodyId: string; questions: Awaited<ReturnType<typeof draftQuiz>> }[] = [];
  for (let i = 0; i < sop.steps.length; i++) {
    const s = sop.steps[i];
    let questions: Awaited<ReturnType<typeof draftQuiz>> = [];
    try {
      questions = await draftQuiz({ material: `${s.bodyEn}\n\n${s.bodyId}`, count: 3 });
    } catch {
      /* content-only module */
    }
    drafted.push({ bodyEn: s.bodyEn, bodyId: s.bodyId, questions });
    console.log(`[course] drafted ${i + 1}/${sop.steps.length} (${questions.length} questions)`);
  }

  const course = (await prisma.course.create({
    data: {
      organizationId: orgId,
      titleEn: sop.titleEn,
      titleId: sop.titleId,
      description: sop.descriptionEn,
      published: false,
    },
    select: { id: true },
  })) as { id: string };

  for (let i = 0; i < drafted.length; i++) {
    const d = drafted[i];
    const firstLineEn = d.bodyEn.split("\n")[0]?.slice(0, 120) || `Step ${i + 1}`;
    const firstLineId = d.bodyId.split("\n")[0]?.slice(0, 120) || `Tahap ${i + 1}`;
    const mod = (await prisma.module.create({
      data: {
        organizationId: orgId,
        titleEn: firstLineEn,
        titleId: firstLineId,
        bodyEn: d.bodyEn,
        bodyId: d.bodyId,
      },
      select: { id: true },
    })) as { id: string };
    await prisma.courseModule.create({
      data: { organizationId: orgId, courseId: course.id, moduleId: mod.id, rank: i + 1 },
    });
    for (let qi = 0; qi < d.questions.length; qi++) {
      const q = d.questions[qi];
      await prisma.question.create({
        data: {
          organizationId: orgId,
          moduleId: mod.id,
          rank: qi + 1,
          type: q.type,
          promptEn: q.promptEn,
          promptId: q.promptId,
          config: q.config,
        },
      });
    }
    console.log(`[course] saved module ${i + 1}/${drafted.length}`);
  }
  console.log(`[course] Created DRAFT course ${course.id} — "${sop.titleEn}" with ${drafted.length} modules. Review + publish in the Training builder.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
