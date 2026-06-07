"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";

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
import {
  createStaff,
  updateStaff,
  uploadStaffPhoto,
} from "@/app/(app)/staff/actions";

const today = () => new Date().toISOString().slice(0, 10);
const newSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  rate: z.string().regex(/^[0-9.]+$/),
  effectiveFrom: z.string().min(1),
  bio: z.string().optional(),
});
const editSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  avatar: z.string().optional(),
  bio: z.string().optional(),
});
type NewForm = z.infer<typeof newSchema>;
type EditForm = z.infer<typeof editSchema>;

export function AddStaffDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: {
    id: string;
    name: string;
    role: string | null;
    avatar: string | null;
    photoPath: string | null;
    bio: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startT] = useTransition();
  const [photoPath, setPhotoPath] = useState<string | null>(existing?.photoPath ?? null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isEdit = !!existing;
  const newForm = useForm<NewForm>({
    resolver: zodResolver(newSchema),
    defaultValues: { name: "", rate: "0", effectiveFrom: today(), bio: "" },
  });
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: existing?.name ?? "",
      role: existing?.role ?? "",
      avatar: existing?.avatar ?? "",
      bio: existing?.bio ?? "",
    },
  });

  async function handleFileSelect(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadStaffPhoto(fd);
      if (r.ok && r.data) {
        setPhotoPath(r.data.path);
        toast.success("Photo uploaded");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onCreate(v: NewForm) {
    startT(async () => {
      const r = await createStaff({ ...v, photoPath });
      if (r.ok) {
        toast.success("Staff added");
        setOpen(false);
        newForm.reset();
        setPhotoPath(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function onEdit(v: EditForm) {
    if (!existing) return;
    startT(async () => {
      const r = await updateStaff(existing.id, { ...v, photoPath });
      if (r.ok) {
        toast.success("Saved");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const photoSection = (
    <div className="flex gap-3">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border bg-muted">
        {photoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${photoPath}`} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Camera className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || pending}
        >
          {uploading ? "Uploading…" : photoPath ? "Replace photo" : "Upload photo"}
        </Button>
        {photoPath ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPhotoPath(null)}
            disabled={uploading || pending}
            className="text-xs"
          >
            <X className="h-3 w-3" /> Remove
          </Button>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          Auto-resized + WebP. JPG/PNG/HEIC fine.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileSelect(f);
        }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {isEdit ? (
          <form onSubmit={editForm.handleSubmit(onEdit)}>
            <DialogHeader><DialogTitle>Edit staff</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {photoSection}
              <div className="space-y-2"><Label>Name</Label><Input {...editForm.register("name")} autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Role</Label><Input {...editForm.register("role")} placeholder="Field lead / Harvester" /></div>
                <div className="space-y-2"><Label>Avatar initials</Label><Input {...editForm.register("avatar")} maxLength={3} placeholder="EM" /></div>
              </div>
              <div className="space-y-2">
                <Label>About / fun facts</Label>
                <Textarea
                  {...editForm.register("bio")}
                  placeholder="Family, pets, hobbies, favourite food, animal names — whatever makes them feel known."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={newForm.handleSubmit(onCreate)}>
            <DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {photoSection}
              <div className="space-y-2"><Label>Name</Label><Input {...newForm.register("name")} autoFocus /></div>
              <div className="space-y-2"><Label>Role</Label><Input {...newForm.register("role")} placeholder="Field lead / Harvester" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Starting rate (IDR/hr)</Label><Input type="number" step="any" min="0" {...newForm.register("rate")} /></div>
                <div className="space-y-2"><Label>Effective from</Label><Input type="date" {...newForm.register("effectiveFrom")} /></div>
              </div>
              <div className="space-y-2">
                <Label>About / fun facts (optional)</Label>
                <Textarea
                  {...newForm.register("bio")}
                  placeholder="Family, pets, hobbies, favourite food, animal names…"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
