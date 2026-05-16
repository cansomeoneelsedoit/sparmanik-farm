import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { ChatPanel } from "@/app/(app)/ask-ai/chat-panel";

export const dynamic = "force-dynamic";

export default async function AskAiPage() {
  const session = await auth();
  const messages = session?.user?.id
    ? await prisma.aiMessage.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
        take: 100,
      })
    : [];

  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="flex h-full flex-col space-y-4">
      <h1 className="font-serif text-3xl">Ask AI</h1>
      {!hasKey ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Set <code>ANTHROPIC_API_KEY</code> in your environment to enable the Claude assistant.
          </CardContent>
        </Card>
      ) : null}
      <ChatPanel
        initialMessages={(messages as { id: string; role: "USER" | "ASSISTANT"; content: string }[]).map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "user" : "assistant",
          content: m.content,
        }))}
        disabled={!hasKey}
      />
    </div>
  );
}
