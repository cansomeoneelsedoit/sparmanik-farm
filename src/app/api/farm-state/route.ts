import type { InputJsonValue } from "@/server/decimal";
import { prisma } from "@/lib/prisma";
import { checkApiToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = checkApiToken(request);
  if (!gate.ok) return gate.response;

  try {
    const doc = await prisma.farmDocument.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, state: {} },
      select: { state: true },
    });
    return Response.json(doc.state ?? {});
  } catch (err) {
    console.error("GET /api/farm-state failed:", err);
    return Response.json({ error: "Failed to read state" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const gate = checkApiToken(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  try {
    await prisma.farmDocument.upsert({
      where: { id: 1 },
      update: { state: body as InputJsonValue },
      create: { id: 1, state: body as InputJsonValue },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/farm-state failed:", err);
    return Response.json({ error: "Failed to save state" }, { status: 500 });
  }
}
