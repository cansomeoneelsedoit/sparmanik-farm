"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { logDisposition, updateDisposition, createCustomerQuick } from "@/app/(app)/harvest/actions";

type DispositionType = "BREAKAGE" | "STAFF" | "GIVEAWAY";
type Customer = { id: string; name: string; type: string };
type StaffOption = { id: string; name: string };

/** An existing disposition being edited (pre-fills the dialog). */
export type EditableDisposition = {
  id: string;
  produceId: string;
  weight: string;
  date: string; // YYYY-MM-DD
  pricePerKg: string; // "" when none
  staffId: string | null;
  customerId: string | null;
  note: string;
};

const TYPE_CONFIG: Record<
  DispositionType,
  { noun: string; button: string; blurb: string; weightLabel: string }
> = {
  BREAKAGE: {
    noun: "breakage / spillage",
    button: "Log breakage",
    blurb: "Melon that cracked, spoiled or spilled. Counts toward total yield — no money.",
    weightLabel: "Weight lost (kg)",
  },
  STAFF: {
    noun: "staff consumption",
    button: "Log staff use",
    blurb: "Melon eaten or taken by staff. Counts toward total yield — no charge.",
    weightLabel: "Weight (kg)",
  },
  GIVEAWAY: {
    noun: "giveaway / sample",
    button: "Log giveaway",
    blurb: "Free samples or giveaways. Counts toward total yield — no charge.",
    weightLabel: "Weight given (kg)",
  },
};

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  produceId: z.string().min(1),
  date: z.string().min(1),
  weight: z.string().regex(/^[0-9.]+$/),
});
type Form = z.infer<typeof schema>;

export function LogDispositionDialog({
  harvestId,
  type,
  produces,
  staff = [],
  customers: initialCustomers = [],
  existing,
  trigger,
}: {
  harvestId: string;
  type: DispositionType;
  produces: { id: string; name: string }[];
  /** Staff list — shown only for the STAFF type. */
  staff?: StaffOption[];
  /** Customers — shown only for the GIVEAWAY type (who got the sample). */
  customers?: Customer[];
  /** When set, the dialog edits this entry instead of creating a new one. */
  existing?: EditableDisposition;
  /** Custom trigger (e.g. an edit pencil). Defaults to a "Log …" button. */
  trigger?: ReactNode;
}) {
  const cfg = TYPE_CONFIG[type];
  const isEdit = !!existing;
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(existing?.customerId ?? null);
  const [staffId, setStaffId] = useState<string | null>(existing?.staffId ?? null);
  const [pricePerKg, setPricePerKg] = useState(existing?.pricePerKg ?? ""); // optional memo value
  const [note, setNote] = useState(existing?.note ?? "");

  const defaults: Form = existing
    ? { produceId: existing.produceId, weight: existing.weight, date: existing.date }
    : { produceId: "", weight: "0", date: today() };
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });

  const weightNum = Number(form.watch("weight")) || 0;
  const priceNum = Number(pricePerKg) || 0;
  const memoValue = weightNum * priceNum;

  async function handleCreateCustomer(typed: string) {
    const r = await createCustomerQuick({ name: typed, type: "CONSUMER" });
    if (r.ok && r.data) {
      const c = { id: r.data.id, name: r.data.name, type: r.data.type };
      setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(c.id);
      toast.success(`Added ${c.name}`);
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  function reset() {
    form.reset(defaults);
    setCustomerId(existing?.customerId ?? null);
    setStaffId(existing?.staffId ?? null);
    setPricePerKg(existing?.pricePerKg ?? "");
    setNote(existing?.note ?? "");
  }

  function onSubmit(v: Form) {
    startT(async () => {
      const payload = {
        type,
        produceId: v.produceId,
        weight: v.weight,
        date: v.date,
        pricePerKg: pricePerKg.trim() ? pricePerKg : undefined,
        staffId: type === "STAFF" ? staffId || undefined : undefined,
        customerId: type === "GIVEAWAY" ? customerId || undefined : undefined,
        note: note.trim() || undefined,
      };
      const r = isEdit
        ? await updateDisposition(existing.id, payload)
        : await logDisposition({ harvestId, ...payload });
      if (r.ok) {
        toast.success(isEdit ? "Saved" : "Recorded");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            {cfg.button}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit" : "Log"} {cfg.noun}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {cfg.blurb}
            </p>

            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3 [&>*]:min-w-0">
              <div className="space-y-2">
                <Label>Produce</Label>
                <Combobox
                  value={form.watch("produceId") ?? null}
                  onChange={(v) => form.setValue("produceId", v ?? "")}
                  placeholder="Pick produce"
                  options={produces.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{cfg.weightLabel}</Label>
                <Input type="number" step="any" min="0" {...form.register("weight")} />
              </div>
            </div>

            {type === "STAFF" ? (
              <div className="space-y-2">
                <Label>
                  Staff member{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Combobox
                  value={staffId}
                  onChange={(v) => setStaffId(v)}
                  placeholder={staff.length === 0 ? "No staff yet — add via /staff" : "Who took it?"}
                  options={staff.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            ) : null}

            {type === "GIVEAWAY" ? (
              <div className="space-y-2">
                <Label>
                  Given to{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Combobox
                  value={customerId}
                  onChange={(v) => setCustomerId(v)}
                  placeholder="Search or type to add"
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  onCreate={handleCreateCustomer}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label>
                  Value/kg (Rp){" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Note{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened?"
              />
            </div>

            <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              {weightNum > 0 ? (
                <>
                  <strong className="text-foreground">{weightNum} kg</strong> recorded as{" "}
                  {type === "BREAKAGE"
                    ? "breakage"
                    : type === "STAFF"
                      ? "staff consumption"
                      : "giveaway"}
                  {memoValue > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}· memo value ≈ Rp{" "}
                      {memoValue.toLocaleString("id-ID", { maximumFractionDigits: 0 })} (not charged)
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Enter a weight to record.</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
