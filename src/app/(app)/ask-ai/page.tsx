import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { availableProviders } from "@/server/ai";
import { Card, CardContent } from "@/components/ui/card";
import { AskAiShell, type Attachment, type ConversationSummary } from "@/app/(app)/ask-ai/ask-ai-shell";

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

export default async function AskAiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const { c: requestedConversationId } = await searchParams;

  // Load conversations for the sidebar. Always show even with no key set, so
  // the user can still browse old chats.
  const conversations: ConversationSummary[] = userId
    ? (
        await prisma.aiConversation.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: { id: true, title: true, updatedAt: true, provider: true },
        })
      ).map((c: { id: string; title: string | null; updatedAt: Date; provider: string | null }) => ({
        id: c.id,
        title: c.title ?? "New chat",
        updatedAt: c.updatedAt.toISOString(),
        provider: c.provider ?? null,
      }))
    : [];

  // Pick the active conversation: ?c=… if provided, else newest, else create
  // a fresh empty one. The fresh case is so a brand-new user lands in a
  // usable state without needing to click "New chat".
  let activeConversationId: string | null = null;
  if (userId) {
    if (requestedConversationId && conversations.some((c) => c.id === requestedConversationId)) {
      activeConversationId = requestedConversationId;
    } else if (conversations.length > 0) {
      activeConversationId = conversations[0].id;
    } else {
      const fresh = await prisma.aiConversation.create({ data: { userId } });
      activeConversationId = fresh.id;
      conversations.unshift({
        id: fresh.id,
        title: "New chat",
        updatedAt: fresh.updatedAt.toISOString(),
        provider: null,
      });
    }
  }

  // Load messages for the active conversation only.
  const rows: PersistedMessage[] = activeConversationId
    ? ((await prisma.aiMessage.findMany({
        where: { conversationId: activeConversationId },
        orderBy: { createdAt: "asc" },
        take: 200,
      })) as PersistedMessage[])
    : [];

  const initialMessages = rows.map((m) => ({
    id: m.id,
    role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
    attachments: parseAttachments(m.attachments),
  }));

  const providers = availableProviders();
  const hasAnyProvider = providers.length > 0;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      {!hasAnyProvider ? (
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Set <code>ANTHROPIC_API_KEY</code> or <code>GEMINI_API_KEY</code> in your environment to enable Ask AI.
            </CardContent>
          </Card>
        </div>
      ) : null}
      <AskAiShell
        conversations={conversations}
        activeConversationId={activeConversationId}
        initialMessages={initialMessages}
        providers={providers}
        disabled={!hasAnyProvider}
      />
    </div>
  );
}
