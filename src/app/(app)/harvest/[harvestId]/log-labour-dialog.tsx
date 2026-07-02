"use client";

import { useMemo, useState, useTransition } from "react";
import { todayWIB } from "@/lib/date";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Combobox } from "@/components/ui/combobox";
import { createWageEntry } from "@/app/(app)/staff/actions";
import { createLabourTaskQuick } from "@/app/(app)/settings/actions";

/** Sentinel option representing "type something custom". */
const OTHER_TASK_VALUE = "__other__";

const today = () => todayWIB();
/** Schema built with the active translator so required-field errors follow the
 *  EN/ID toggle instead of leaking English into a translated dialog. */
const makeSchema = (t: (key: string) => string) =>
  z.object({
    staffId: z.string().min(1, t("errPickStaff")),
    date: z.string().min(1),
    hours: z.string().regex(/^[0-9.]+$/, t("errHours")),
    // The displayed task — either a row from the predefined list, or
    // OTHER_TASK_VALUE when the user wants to type their own.
    task: z.string().min(1, t("errPickTask")),
    // Populated only when `task === OTHER_TASK_VALUE`.
    customTask: z.string().optional(),
  });
type Form = z.infer<ReturnType<typeof makeSchema>>;

/**
 * Lets the user log labour hours from inside a harvest detail page so the
 * labour cost stat updates without round-tripping through /staff. Task is
 * required and picked from a predefined list (managed under Settings →
 * Labour tasks) — selecting "Other" reveals a free-text input so unusual
 * one-offs aren't blocked.
 */
export function LogLabourDialog({
  harvestId,
  staff,
  tasks,
}: {
  harvestId: string;
  staff: { id: string; name: string; rate: string | null }[];
  tasks: { id: string; name: string }[];
}) {
  const t = useTranslations("labourDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [localTasks, setLocalTasks] = useState(tasks);
  const router = useRouter();
  const schema = useMemo(() => makeSchema(t), [t]);
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { staffId: "", date: today(), hours: "0", task: "", customTask: "" },
  });

  const taskValue = form.watch("task");
  const isOther = taskValue === OTHER_TASK_VALUE;

  function onSubmit(v: Form) {
    // Resolve display value of task. For the predefined list, the value IS
    // the task name; for "Other" we use whatever the user typed.
    const resolved =
      v.task === OTHER_TASK_VALUE ? (v.customTask ?? "").trim() : v.task;
    if (!resolved) {
      form.setError("customTask", { message: t("typeOrPick") });
      return;
    }
    startT(async () => {
      const r = await createWageEntry({
        staffId: v.staffId,
        date: v.date,
        lines: [
          {
            hours: v.hours,
            task: resolved,
            harvestId,
          },
        ],
      });
      if (r.ok) {
        toast.success(t("toastLogged"));
        setOpen(false);
        form.reset({
          staffId: "",
          date: today(),
          hours: "0",
          task: "",
          customTask: "",
        });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function handleCreateTask(typed: string) {
    const r = await createLabourTaskQuick(typed);
    if (r.ok && r.data) {
      setLocalTasks((prev) => [...prev, { id: r.data!.id, name: r.data!.name }]);
      form.setValue("task", r.data.name);
      toast.success(t("addedToList", { name: r.data.name }));
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  const selectedStaff = staff.find((s) => s.id === form.watch("staffId"));
  const hours = Number(form.watch("hours") || 0);
  const rate = selectedStaff?.rate ? Number(selectedStaff.rate) : null;
  const estimatedCost = rate !== null && hours > 0 ? (rate * hours).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("staffMember")}</Label>
              <Combobox
                value={form.watch("staffId")}
                onChange={(v) => form.setValue("staffId", v ?? "")}
                placeholder={staff.length === 0 ? t("noStaffYet") : t("pickStaff")}
                options={staff.map((s) => ({
                  value: s.id,
                  label: s.name,
                  description: s.rate ? t("perHour", { rate: s.rate }) : t("noRate"),
                }))}
              />
              {form.formState.errors.staffId ? (
                <p className="text-xs text-destructive">{form.formState.errors.staffId.message}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("hours")}</Label>
                <Input type="number" step="any" min="0" {...form.register("hours")} />
              </div>
              <div className="space-y-2">
                <Label>{t("date")}</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                {t("task")} <span className="text-destructive">*</span>
              </Label>
              <Combobox
                value={taskValue || null}
                onChange={(v) => form.setValue("task", v ?? "")}
                placeholder={t("pickTask")}
                emptyHint={t("emptyHint")}
                options={[
                  ...localTasks.map((task) => ({ value: task.name, label: task.name })),
                  { value: OTHER_TASK_VALUE, label: t("otherOption") },
                ]}
                onCreate={handleCreateTask}
                createLabel={(typed) => t("addToList", { name: typed })}
              />
              {form.formState.errors.task ? (
                <p className="text-xs text-destructive">{form.formState.errors.task.message}</p>
              ) : null}
              {isOther ? (
                <Input
                  {...form.register("customTask")}
                  placeholder={t("customPlaceholder")}
                  autoFocus
                />
              ) : null}
              {form.formState.errors.customTask ? (
                <p className="text-xs text-destructive">{form.formState.errors.customTask.message}</p>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                {t("manageHint")}{" "}
                <a href="/settings/labour-tasks" className="underline" target="_blank">
                  {t("manageLink")}
                </a>
                .
              </p>
            </div>
            {estimatedCost ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {t("estimatedCost")} <strong className="text-foreground">{estimatedCost}</strong>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("logButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
