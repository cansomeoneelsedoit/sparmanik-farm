"use client";

import { useState, useTransition, useRef, useEffect, type ClipboardEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, ArrowUp, X, Sparkles, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendAiMessage, clearAiHistory, uploadAiAttachment } from "@/app/(app)/ask-ai/actions";

export type Attachment = { path: string; mimeType: string; width?: number; height?: number };
type Msg = { id: string; role: "user" | "assistant"; content: string; attachments?: Attachment[] };

const MAX_ATTACHMENTS = 4;

const SUGGESTIONS = [
  "What's running in the greenhouses right now?",
  "Which items are about to run out?",
  "Summarise this week's tasks",
  "Help me draft a SOP for melon pollination",
];

export function ChatPanel({
  initialMessages,
  disabled,
}: {
  initialMessages: Msg[];
  disabled: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startT] = useTransition();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-grow the textarea up to a fixed cap.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [draft]);

  // Scroll to the bottom whenever a new message lands.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  async function uploadFiles(files: File[]) {
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_ATTACHMENTS} attachments per message`);
      return;
    }
    const toUpload = files.filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (toUpload.length === 0) {
      toast.error("Only images are supported");
      return;
    }
    setUploading(true);
    try {
      for (const file of toUpload) {
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadAiAttachment(fd);
        if (r.ok && r.data) {
          setAttachments((prev) => [...prev, r.data!]);
        } else {
          toast.error(r.ok ? "Upload failed" : r.error);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void uploadFiles(files);
  }

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;
    const userMsg: Msg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: trimmed,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    const sentAttachments = attachments;
    setAttachments([]);
    startT(async () => {
      const r = await sendAiMessage({
        content: trimmed,
        attachments: sentAttachments.length > 0
          ? sentAttachments.map((a) => ({ path: a.path, mimeType: a.mimeType }))
          : undefined,
      });
      if (r.ok && r.data) {
        setMessages((m) => [...m, { id: `tmp-${Date.now()}-r`, role: "assistant", content: r.data!.reply }]);
        router.refresh();
      } else {
        toast.error(r.ok ? "No reply" : r.error);
      }
    });
  }

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !uploading && !pending && !disabled;
  const showEmpty = messages.length === 0 && !pending;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-4">
        {showEmpty ? (
          <EmptyState
            disabled={disabled}
            onPick={(s) => {
              setDraft(s);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          />
        ) : (
          <div className="space-y-6 pb-4">
            {messages.map((m) => (m.role === "user" ? (
              <UserBubble key={m.id} content={m.content} attachments={m.attachments} />
            ) : (
              <AssistantBubble key={m.id} content={m.content} />
            )))}
            {pending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span>Thinking…</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        className={cn(
          "sticky bottom-0 -mx-1 mb-3 rounded-2xl border bg-background shadow-sm transition-colors",
          dragging ? "border-accent ring-2 ring-accent/40" : "border-border",
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          onDrop(e);
        }}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b p-3">
            {attachments.map((a, i) => (
              <AttachmentChip
                key={a.path}
                path={a.path}
                onRemove={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            {uploading ? <div className="self-center text-xs text-muted-foreground">Uploading…</div> : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2 p-2">
          <button
            type="button"
            disabled={disabled || uploading || attachments.length >= MAX_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
            title="Attach images"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void uploadFiles(files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) submit();
              }
            }}
            placeholder={disabled ? "Set ANTHROPIC_API_KEY to enable Ask AI." : "Ask anything about your farm…"}
            rows={1}
            disabled={disabled || pending}
            className="min-h-[36px] max-h-[200px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            title="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Claude can review images and answer questions about your farm. Up to {MAX_ATTACHMENTS} per message.</span>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startT(async () => {
                const r = await clearAiHistory();
                if (r.ok) {
                  setMessages([]);
                  router.refresh();
                } else {
                  toast.error(r.error);
                }
              })
            }
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear history
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ disabled, onPick }: { disabled: boolean; onPick: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <Sparkles className="mx-auto h-8 w-8 text-accent" />
        <h2 className="font-serif text-3xl">Ask anything about your farm.</h2>
        <p className="text-sm text-muted-foreground">Paste a leaf photo, drop an image, or ask a question.</p>
      </div>
      {disabled ? null : (
        <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition hover:border-accent/60 hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserBubble({ content, attachments }: { content: string; attachments?: Attachment[] }) {
  const hasImages = attachments && attachments.length > 0;
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm">
        {hasImages ? (
          <div
            className={cn(
              "grid gap-2",
              attachments!.length === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {attachments!.map((a) => (
              <a
                key={a.path}
                href={`/api/uploads/${a.path}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border"
              >
                {/* Authenticated route streams the WebP; native <img> is fine. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/uploads/${a.path}`}
                  alt="attachment"
                  className="h-40 w-full object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
        {content ? <div className="whitespace-pre-wrap">{content}</div> : null}
      </div>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-stone max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className?.startsWith("language-");
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children, ...props }) {
            return (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" {...props}>
                {children}
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AttachmentChip({ path, onRemove }: { path: string; onRemove: () => void }) {
  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-md border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/uploads/${path}`} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
