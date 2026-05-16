"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/app/(app)/ask-ai/chat-panel";
import type { Attachment as AttachmentT, AiProvider } from "@/app/(app)/ask-ai/chat-panel";
import { createConversation, deleteConversation } from "@/app/(app)/ask-ai/actions";

export type Attachment = AttachmentT;
export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  provider: string | null;
};
type Msg = { id: string; role: "user" | "assistant"; content: string; attachments?: Attachment[] };

export function AskAiShell({
  conversations,
  activeConversationId,
  initialMessages,
  providers,
  disabled,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  initialMessages: Msg[];
  providers: AiProvider[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function onNewChat() {
    startT(async () => {
      const r = await createConversation();
      if (r.ok && r.data) router.push(`/ask-ai?c=${r.data.id}`);
      else toast.error(r.ok ? "No id" : r.error);
    });
  }

  function onDelete(id: string) {
    startT(async () => {
      const r = await deleteConversation(id);
      if (r.ok) {
        setPendingDelete(null);
        if (id === activeConversationId) router.push("/ask-ai");
        else router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card/40 md:flex">
        <div className="flex items-center justify-between border-b px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || disabled}
            onClick={onNewChat}
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {conversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No past chats yet.
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                active={c.id === activeConversationId}
                onOpen={() => router.push(`/ask-ai?c=${c.id}`)}
                onAskDelete={() => setPendingDelete(c.id)}
              />
            ))
          )}
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatPanel
          key={activeConversationId ?? "none"}
          conversationId={activeConversationId}
          initialMessages={initialMessages}
          providers={providers}
          disabled={disabled || !activeConversationId}
        />
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this conversation?"
        description="The chat and all its attached images become inaccessible. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
        }}
      />
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onOpen,
  onAskDelete,
}: {
  conv: ConversationSummary;
  active: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
}) {
  const when = new Date(conv.updatedAt);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  const label = sameDay
    ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-accent/10",
          active && "bg-accent/15",
        )}
      >
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{conv.title || "New chat"}</span>
          <span className="block text-[10px] text-muted-foreground">{label}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAskDelete();
        }}
        className="absolute right-1 top-1.5 hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
        title="Delete chat"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
