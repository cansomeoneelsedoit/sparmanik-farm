"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pencil,
  PlayCircle,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import {
  addAiKey,
  deleteAiKey,
  reorderAiKey,
  setAiKeyEnabled,
  testAiKey,
  updateAiKey,
} from "@/app/(app)/settings/ai-keys/actions";

type KeyRow = {
  id: string;
  provider: string;
  label: string | null;
  maskedKey: string;
  keyLength: number;
  model: string | null;
  rank: number;
  enabled: boolean;
  lastStatus: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
};

export function AiKeyManager({
  rows,
  supportedProviders,
}: {
  rows: KeyRow[];
  supportedProviders: string[];
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<string>("gemini");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [reveal, setReveal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editModel, setEditModel] = useState("");

  function startEdit(r: KeyRow) {
    setEditId(r.id);
    setEditLabel(r.label ?? "");
    setEditApiKey("");
    setEditModel(r.model ?? "");
  }

  function clearAdd() {
    setProvider("gemini");
    setLabel("");
    setApiKey("");
    setModel("");
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      {/* Add new key */}
      {adding ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <Combobox
                value={provider}
                onChange={(v) => setProvider(v ?? "gemini")}
                placeholder="Pick provider"
                options={supportedProviders.map((p) => ({ value: p, label: p }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Label (optional)
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Primary, Boyd backup"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">API key</label>
            <div className="relative">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the key"
                type={reveal ? "text" : "password"}
                className="pr-9 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                title={reveal ? "Hide" : "Reveal"}
              >
                {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Model override (optional)
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gemini-2.5-pro · leave blank for default"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={clearAdd} disabled={pending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || !apiKey.trim()}
              onClick={() =>
                startT(async () => {
                  const r = await addAiKey({
                    provider,
                    label: label.trim(),
                    apiKey: apiKey.trim(),
                    model: model.trim(),
                  });
                  if (r.ok) {
                    toast.success(`Added ${provider} key`);
                    clearAdd();
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              Add key
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} size="sm">
          + Add provider key
        </Button>
      )}

      {/* Existing keys */}
      <ul className="divide-y rounded-md border">
        {rows.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            No keys yet. Add one above — Gemini (free, generous quota) is a good place to start.
          </li>
        ) : (
          rows.map((r, idx) => {
            const isEditing = editId === r.id;
            const statusColour =
              r.lastStatus === "ok"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : r.lastStatus === "quota"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : r.lastStatus === "error"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-muted text-muted-foreground";
            return (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between",
                  !r.enabled && "opacity-50",
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {/* Rank arrows */}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={pending || idx === 0}
                      onClick={() =>
                        startT(async () => {
                          const x = await reorderAiKey(r.id, "up");
                          if (x.ok) router.refresh();
                          else toast.error(x.error);
                        })
                      }
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={pending || idx === rows.length - 1}
                      onClick={() =>
                        startT(async () => {
                          const x = await reorderAiKey(r.id, "down");
                          if (x.ok) router.refresh();
                          else toast.error(x.error);
                        })
                      }
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        #{idx + 1}
                      </Badge>
                      <Badge variant="secondary">{r.provider}</Badge>
                      {r.label ? (
                        <span className="text-sm font-medium">{r.label}</span>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">no label</span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", statusColour)}
                      >
                        {r.lastStatus ?? "untested"}
                      </Badge>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-2">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Label"
                          className="h-8 text-xs"
                        />
                        <Input
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          placeholder={`Paste new key, or leave blank to keep current (${r.keyLength} chars)`}
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          className="h-8 font-mono text-xs"
                        />
                        <Input
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          placeholder="Model override (blank = default)"
                          className="h-8 font-mono text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startT(async () => {
                                const x = await updateAiKey(r.id, {
                                  label: editLabel.trim(),
                                  apiKey: editApiKey.trim(),
                                  model: editModel.trim(),
                                });
                                if (x.ok) {
                                  toast.success("Saved");
                                  setEditId(null);
                                  router.refresh();
                                } else toast.error(x.error);
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(null)}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span className="truncate">{r.maskedKey}</span>
                          <span className="text-[10px]">· {r.keyLength} chars</span>
                        </div>
                        {r.model ? (
                          <div className="text-xs text-muted-foreground">
                            Model: <code className="font-mono">{r.model}</code>
                          </div>
                        ) : null}
                        {r.lastUsedAt ? (
                          <div className="text-[10px] text-muted-foreground">
                            Last used: {new Date(r.lastUsedAt).toLocaleString()}
                          </div>
                        ) : null}
                        {r.lastError ? (
                          <div className="line-clamp-2 text-[10px] text-rose-600 dark:text-rose-400">
                            Last error: {r.lastError}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(v) =>
                        startT(async () => {
                          const x = await setAiKeyEnabled(r.id, v);
                          if (x.ok) router.refresh();
                          else toast.error(x.error);
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startT(async () => {
                          toast.message(`Testing ${r.provider}…`);
                          const x = await testAiKey(r.id);
                          if (x.ok) {
                            toast.success(`OK — replied "${x.data?.text}"`);
                          } else {
                            toast.error(`Test failed: ${x.error}`);
                          }
                          router.refresh();
                        })
                      }
                    >
                      <PlayCircle className="h-3.5 w-3.5" /> Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(r)}
                      disabled={pending}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Delete this ${r.provider} key?`)) return;
                        startT(async () => {
                          const x = await deleteAiKey(r.id);
                          if (x.ok) {
                            toast.success("Deleted");
                            router.refresh();
                          } else toast.error(x.error);
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      <p className="text-[10px] text-muted-foreground">
        Keys are stored server-side only; the dashboard masks all but the last 6
        characters. Click <X className="-mt-0.5 inline h-2.5 w-2.5" /> to wipe;
        the eye toggle on Add only affects the input you&apos;re typing into.
      </p>
    </div>
  );
}
