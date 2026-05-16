"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sendAiMessage, clearAiHistory } from "@/app/(app)/ask-ai/actions";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export function ChatPanel({ initialMessages, disabled }: { initialMessages: Msg[]; disabled: boolean }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startT] = useTransition();
  const router = useRouter();

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: "user", content: trimmed };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    startT(async () => {
      const r = await sendAiMessage({ content: trimmed });
      if (r.ok && r.data) {
        setMessages((m) => [...m, { id: `tmp-${Date.now()}-r`, role: "assistant", content: r.data!.reply }]);
        router.refresh();
      } else {
        toast.error(r.ok ? "No reply" : r.error);
      }
    });
  }

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Ask anything about your farm operations.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "ml-auto bg-accent text-accent-foreground" : "bg-muted",
              )}
            >
              {m.content}
            </div>
          ))
        )}
        {pending ? <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Thinking…</div> : null}
      </CardContent>
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Ask a question…"
            disabled={disabled || pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <Button onClick={submit} disabled={disabled || pending || !draft.trim()}>{pending ? "Send" : "Send"}</Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startT(async () => {
                  await clearAiHistory();
                  setMessages([]);
                  router.refresh();
                })
              }
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
