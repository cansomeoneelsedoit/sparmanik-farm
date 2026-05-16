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
import { addYoutubeVideo } from "@/app/(app)/videos/actions";

const schema = z.object({
  titleEn: z.string().min(1),
  titleId: z.string().min(1),
  category: z.string().optional(),
  url: z.string().url(),
});
type Form = z.infer<typeof schema>;

export function AddYoutubeVideoDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema) });

  function onSubmit(v: Form) {
    startT(async () => {
      const r = await addYoutubeVideo(v);
      if (r.ok) {
        toast.success("Video added");
        setOpen(false);
        form.reset();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader><DialogTitle>Add YouTube video</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Title (EN)</Label><Input {...form.register("titleEn")} /></div>
              <div className="space-y-2"><Label>Title (ID)</Label><Input {...form.register("titleId")} /></div>
            </div>
            <div className="space-y-2"><Label>Category</Label><Input {...form.register("category")} /></div>
            <div className="space-y-2"><Label>YouTube URL</Label><Input {...form.register("url")} placeholder="https://youtu.be/…" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
