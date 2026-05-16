import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { ChatPanel, type Attachment } from "@/app/(app)/ask-ai/chat-panel";

export const dynamic = "force-dynamic";

type PersistedMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  attachments: unknown;
};

function parseAttachments(raw: unknown): Attachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Attachment[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "path" in item && "mimeType" in item) {
      const it = item as Record<string, unknown>;
      if (typeof it.path === "string" && typeof it.mimeType === "string") {
        out.push({
          path: it.path,
          mimeType: it.mimeType,
          width: typeof it.width === "number" ? it.width : undefined,
          height: typeof it.height === "number" ? it.height : undefined,
        });
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

export default async function AskAiPage() {
  const session = await auth();
  const rows = session?.user?.id
    ? ((await prisma.aiMessage.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
        take: 100,
      })) as PersistedMessage[])
    : [];

  const initialMessages = rows.map((m) => ({
    id: m.id,
    role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
    attachments: parseAttachments(m.attachments),
  }));

  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      {!hasKey ? (
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Set <code>ANTHROPIC_API_KEY</code> in your environment to enable the Claude assistant.
            </CardContent>
          </Card>
        </div>
      ) : null}
      <ChatPanel initialMessages={initialMessages} disabled={!hasKey} />
    </div>
  );
}
