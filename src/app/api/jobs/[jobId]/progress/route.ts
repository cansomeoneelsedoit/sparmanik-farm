import { auth } from "@/auth";
import { getJobProgress } from "@/server/job-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll endpoint for long-running training jobs (YouTube-to-course, AI quiz
 * drafting, course-from-SOP). A plain GET Route Handler — NOT a server action
 * — on purpose: Next.js serializes server actions, so while the job's own
 * server action is in flight a server-action poll would queue behind it and
 * never resolve, freezing the progress bar. A fetch to this route runs
 * concurrently, so the bar updates live.
 *
 * Any signed-in user may read: job ids are unguessable client-generated UUIDs
 * and the progress payload carries no sensitive data.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { jobId } = await params;
  if (typeof jobId !== "string" || jobId.length < 8 || jobId.length > 64) {
    return new Response("Not found", { status: 404 });
  }
  const progress = getJobProgress(jobId);
  return Response.json(progress, { headers: { "Cache-Control": "no-store" } });
}
