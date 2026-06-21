"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

import { SmartImage } from "@/components/shared/smart-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCustomer, updateCustomer } from "@/app/(app)/customers/actions";

export const CUSTOMER_TYPES = [
  { value: "RETAILER", label: "Retailer", hint: "resells to the final consumer" },
  { value: "WHOLESALER", label: "Wholesaler / Distributor", hint: "buys bulk to distribute" },
  { value: "CONSUMER", label: "Consumer", hint: "the final buyer" },
] as const;

const schema = z.object({
  name: z.string().min(1, "Required"),
  type: z.enum(["RETAILER", "WHOLESALER", "CONSUMER"]),
  phone: z.string().optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")).default(""),
  notes: z.string().optional().default(""),
});
type Form = z.infer<typeof schema>;

/** Downscale a picked image to a small square-ish WebP in the browser, so the
 *  DB blob stays tiny (a logo never needs to be more than a couple hundred px).
 *  Returns the base64 (no data-URL prefix) plus a data-URL for live preview. */
function fileToLogo(file: File, max = 256): Promise<{ base64: string; mime: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/webp", 0.85);
        resolve({ base64: dataUrl.split(",")[1] ?? "", mime: "image/webp", dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function CustomerFormDialog({
  trigger,
  existing,
}: {
  trigger: ReactNode;
  existing?: {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    hasLogo?: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!existing;

  const fileRef = useRef<HTMLInputElement>(null);
  // Newly-picked logo (base64 WebP) — null until the user picks one this session.
  const [logo, setLogo] = useState<{ base64: string; mime: string } | null>(null);
  // Whether to clear an existing logo on save.
  const [logoRemove, setLogoRemove] = useState(false);
  // Live preview: the freshly-picked data-URL, else the saved logo (edit), else none.
  const initialPreview = existing?.hasLogo ? `/api/customers/${existing.id}/logo` : null;
  const [logoPreview, setLogoPreview] = useState<string | null>(initialPreview);

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    try {
      const out = await fileToLogo(file);
      setLogo({ base64: out.base64, mime: out.mime });
      setLogoPreview(out.dataUrl);
      setLogoRemove(false);
    } catch {
      toast.error("Could not process that image");
    }
  }

  function clearLogo() {
    setLogo(null);
    setLogoPreview(null);
    setLogoRemove(true);
  }

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? "",
      type: (existing?.type as Form["type"]) ?? "CONSUMER",
      phone: existing?.phone ?? "",
      email: existing?.email ?? "",
      notes: existing?.notes ?? "",
    },
  });

  function onSubmit(values: Form) {
    const payload = {
      ...values,
      logoBase64: logo?.base64 ?? null,
      logoMime: logo?.mime ?? null,
      logoRemove,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateCustomer(existing.id, payload)
        : await createCustomer(payload);
      if (result.ok) {
        toast.success(isEdit ? "Customer updated" : "Customer added");
        setOpen(false);
        form.reset(values);
        setLogo(null);
        setLogoRemove(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>Who you sell to. Type drives reporting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <SmartImage src={logoPreview} alt="Customer logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0 space-y-1">
                <Label>Logo</Label>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> {logoPreview ? "Replace" : "Upload"}
                  </Button>
                  {logoPreview ? (
                    <Button type="button" size="sm" variant="ghost" onClick={clearLogo}>
                      <X className="h-4 w-4" /> Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">Auto-resized. Optional.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} autoFocus />
              {form.formState.errors.name?.message ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as Form["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {CUSTOMER_TYPES.find((t) => t.value === form.watch("type"))?.hint}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input {...form.register("phone")} type="tel" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input {...form.register("email")} type="email" />
                {form.formState.errors.email?.message ? (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
