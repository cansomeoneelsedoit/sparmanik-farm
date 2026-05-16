"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { undoActionById } from "@/app/(app)/audit/actions";

export type AuditEntry = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  undone: boolean;
};

export function AuditHistorySheet({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="icon" variant="ghost" title="Action history">
          <Clock className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Action history</SheetTitle>
          <SheetDescription>Recent actions. Click undo to reverse.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No actions yet.</div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium">{e.description}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {e.undone ? (
                    <span className="text-xs text-muted-foreground">Undone</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await undoActionById(e.id);
                          if (r.ok) {
                            toast.success("Undone");
                            router.refresh();
                          } else {
                            toast.error(r.error);
                          }
                        })
                      }
                    >
                      Undo
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
