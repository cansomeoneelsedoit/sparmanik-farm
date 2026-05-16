"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { X, ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { askEcho } from "@/server/echo-action";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Floating "Echo" — a tiny farmer-themed helper. Click the avatar in the
 * bottom-right of any authenticated page to ask a quick factual question
 * about the farm (stock, harvests, tasks). Distinct from /ask-ai: single
 * turn, in-memory only, never saved to AiConversation.
 */
export function EchoWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startT] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending]);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || pending) return;
    setTurns((t) => [...t, { role: "user", content: trimmed }]);
    setDraft("");
    startT(async () => {
      const r = await askEcho({ question: trimmed });
      const reply = r.ok && r.data ? r.data.reply : r.ok ? "" : r.error;
      setTurns((t) => [...t, { role: "assistant", content: reply || "(no reply)" }]);
    });
  }

  return (
    <>
      {/* Floating avatar — always visible, bottom-right. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Echo" : "Ask Echo"}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-lg transition",
          open
            ? "scale-95 bg-foreground text-background"
            : "bg-accent text-accent-foreground hover:scale-105",
        )}
      >
        <span aria-hidden>{open ? "✕" : "🧑‍🌾"}</span>
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-40 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-base">🧑‍🌾</div>
            <div className="flex-1">
              <div className="text-sm font-semibold leading-none">Echo</div>
              <div className="text-[10px] text-muted-foreground">Quick farm questions</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {turns.length === 0 ? (
              <EmptyHint onPick={(q) => setDraft(q)} />
            ) : (
              turns.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[88%] rounded-xl px-3 py-2 leading-snug",
                    t.role === "user"
                      ? "ml-auto bg-accent/10"
                      : "bg-muted",
                  )}
                >
                  {t.content}
                </div>
              ))
            )}
            {pending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                <span>Echo's thinking…</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-2 border-t p-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="How much rockwool do I have?"
              className="flex-1 rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || pending}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
              title="Send"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function EmptyHint({ onPick }: { onPick: (q: string) => void }) {
  const suggestions = [
    "What's running in the greenhouses?",
    "Which items are critically low?",
    "Total active harvests right now?",
    "Recent tasks overdue?",
  ];
  return (
    <div className="space-y-2 pt-1">
      <div className="rounded-xl bg-muted px-3 py-2 text-xs leading-snug">
        Hi! I'm <strong>Echo</strong> — ask me anything quick about your farm.
        For longer conversations or photos, use <strong>Ask AI</strong>.
      </div>
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="block w-full rounded-md border bg-background px-3 py-1.5 text-left text-xs hover:border-accent/60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
