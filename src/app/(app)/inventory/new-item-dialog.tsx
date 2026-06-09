"use client";

import { useState, useTransition, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { createItem, updateItem, uploadItemPhoto } from "@/app/(app)/inventory/actions";
import { createCategoryQuick } from "@/app/(app)/settings/actions";

const schema = z.object({
  name: z.string().min(1, "Required"),
  description: z.string().optional(),
  photoPath: z.string().optional(),
  unit: z.string().min(1, "Required"),
  // When the item is sold as a PACK (e.g. a 500-metre roll of drip pipe, or a
  // 500-piece bag of emitters) and used in fractions, capture the sub-unit
  // (metres / pieces / kg / ml) and how many of those fit in one pack. The
  // install dialog then asks for "Quantity (metres)" instead of "Quantity
  // (rolls)" and charges the greenhouse proportional cost: `unitPrice ×
  // (qtyInstalled / subFactor)`.
  subUnit: z.string().optional(),
  subFactor: z
    .string()
    .regex(/^[0-9.]*$/, "Number")
    .optional(),
  // Free-text tag that groups items of the same substance across SKUs.
  // The dialog shows existing family names as a datalist so the user
  // doesn't fragment "Calnit" / "calnit" / "Meroke Calnit".
  productFamily: z.string().max(120).optional(),
  categoryId: z.string().optional(),
  defaultSupplierId: z.string().optional(),
  reorder: z.string().regex(/^[0-9.]+$/, "Number").default("0"),
  location: z.string().optional(),
  reusable: z.boolean().default(false),
  shopeeUrl: z.string().url().optional().or(z.literal("")).optional(),
});

type Form = z.infer<typeof schema>;

export function NewItemDialog({
  trigger,
  categories,
  suppliers,
  existing,
  familyOptions,
}: {
  trigger: ReactNode;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  existing?: {
    id: string;
    name: string;
    description: string | null;
    photoPath: string | null;
    unit: string;
    subUnit: string | null;
    subFactor: string | null;
    productFamily: string | null;
    categoryId: string | null;
    defaultSupplierId: string | null;
    reorder: string;
    location: string | null;
    reusable: boolean;
    shopeeUrl: string | null;
  };
  /** Existing product-family tags in this org, used for autocomplete. */
  familyOptions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [localCategories, setLocalCategories] = useState(categories);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isEdit = !!existing;
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          name: existing.name,
          description: existing.description ?? "",
          photoPath: existing.photoPath ?? "",
          unit: existing.unit,
          subUnit: existing.subUnit ?? "",
          subFactor: existing.subFactor ?? "",
          productFamily: existing.productFamily ?? "",
          categoryId: existing.categoryId ?? undefined,
          defaultSupplierId: existing.defaultSupplierId ?? undefined,
          reorder: existing.reorder,
          location: existing.location ?? "",
          reusable: existing.reusable,
          shopeeUrl: existing.shopeeUrl ?? "",
        }
      : { name: "", description: "", photoPath: "", unit: "", subUnit: "", subFactor: "", productFamily: "", reorder: "0", reusable: false },
  });

  // Open the "sold as a pack" section by default if the item already has
  // pack info; users editing a roll-style item shouldn't have to dig for it.
  const [isPack, setIsPack] = useState<boolean>(
    !!(existing?.subUnit && existing?.subFactor),
  );

  const photoPath = form.watch("photoPath");
  // Buffer the upload response so the bytes (not just the disk path) get
  // submitted with create/update — that's what lets the photo land on the
  // items.photo_data column and survive future DB syncs.
  const [pendingPhoto, setPendingPhoto] = useState<{
    base64: string;
    mime: string;
    width: number;
    height: number;
  } | null>(null);

  async function handleFileSelect(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadItemPhoto(fd);
      if (r.ok && r.data) {
        form.setValue("photoPath", r.data.path);
        setPendingPhoto({
          base64: r.data.previewBase64,
          mime: r.data.mime,
          width: r.data.width,
          height: r.data.height,
        });
        toast.success("Photo uploaded");
      } else if (!r.ok) {
        toast.error(r.error);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onSubmit(values: Form) {
    startTransition(async () => {
      const payload = {
        ...values,
        description: values.description || null,
        photoPath: values.photoPath || null,
        // Forward the bytes from the upload — server saves them to
        // items.photo_data so the photo survives DB sync / restore.
        photoBase64: pendingPhoto?.base64 || null,
        photoMime: pendingPhoto?.mime || null,
        photoWidth: pendingPhoto?.width ?? null,
        photoHeight: pendingPhoto?.height ?? null,
        categoryId: values.categoryId || null,
        defaultSupplierId: values.defaultSupplierId || null,
        shopeeUrl: values.shopeeUrl || null,
        // Only persist sub-unit info when the pack switch is on AND both
        // fields are filled; otherwise null both out so a user who toggled
        // off doesn't keep stale pack data on the item.
        subUnit: isPack && values.subUnit?.trim() ? values.subUnit.trim() : null,
        subFactor:
          isPack && values.subFactor?.trim() && Number(values.subFactor) > 0
            ? values.subFactor.trim()
            : null,
        productFamily: values.productFamily?.trim() || null,
      };
      const r = isEdit ? await updateItem(existing.id, payload) : await createItem(payload);
      if (r.ok) {
        toast.success(isEdit ? "Item saved" : "Item added");
        setOpen(false);
        if (!isEdit) form.reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Row label="Photo">
              <div className="flex items-center gap-3">
                {photoPath ? (
                  // For an existing item, prefer the DB-backed route so we
                  // get the canonical photo even after a sync wiped the
                  // filesystem. For a brand new item (no `existing.id` yet)
                  // the only thing that exists is the freshly-uploaded
                  // filesystem file — point at it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      existing?.id
                        ? `/api/items/${existing.id}/photo?v=${encodeURIComponent(photoPath)}`
                        : `/api/uploads/${photoPath}`
                    }
                    alt=""
                    className="h-20 w-20 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || pending}
                  >
                    {uploading ? "Uploading…" : photoPath ? "Replace" : "Upload"}
                  </Button>
                  {photoPath ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => form.setValue("photoPath", "")}
                      disabled={uploading || pending}
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  ) : null}
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
              </div>
            </Row>
            <Row label="Name" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} autoFocus />
            </Row>
            <Row label="Product info">
              <Textarea
                {...form.register("description")}
                placeholder="What this is, brand/grade, what we use it for…"
                rows={3}
              />
            </Row>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Row label="Unit" error={form.formState.errors.unit?.message}>
                <Input
                  {...form.register("unit")}
                  placeholder={isPack ? "roll / bag / box" : "kg / litres / pcs"}
                />
              </Row>
              <Row label="Reorder threshold" error={form.formState.errors.reorder?.message}>
                <Input {...form.register("reorder")} type="number" min="0" step="any" />
              </Row>
            </div>

            {/* Pack-with-sub-unit (rolls, bags, boxes used in fractions).
                Off by default for new items; on when editing an item that
                already has pack info. */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Sold as a pack used in fractions</Label>
                  <p className="text-xs text-muted-foreground">
                    Turn on for things like a 500&nbsp;m roll of drip pipe, or
                    a 500&nbsp;pc bag of emitters, where the greenhouse uses
                    only part of the pack each install. We&rsquo;ll charge
                    the greenhouse proportional cost.
                  </p>
                </div>
                <Switch
                  checked={isPack}
                  onCheckedChange={(v) => {
                    setIsPack(v);
                    if (!v) {
                      form.setValue("subUnit", "");
                      form.setValue("subFactor", "");
                    }
                  }}
                />
              </div>
              {isPack ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Row
                    label="Measured in"
                    error={form.formState.errors.subUnit?.message}
                  >
                    <Input
                      {...form.register("subUnit")}
                      placeholder="metres / pieces / kg / ml"
                    />
                  </Row>
                  <Row
                    label="Pack size"
                    error={form.formState.errors.subFactor?.message}
                  >
                    <Input
                      {...form.register("subFactor")}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="500"
                    />
                  </Row>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Row label="Category">
                <Combobox
                  value={form.watch("categoryId") || null}
                  onChange={(v) => form.setValue("categoryId", v ?? undefined)}
                  placeholder="Pick category"
                  options={localCategories.map((c) => ({ value: c.id, label: c.name }))}
                  onCreate={async (typed) => {
                    // Inline-create from the picker: same UX the Combobox
                    // already supports for produce in the harvest dialog.
                    const r = await createCategoryQuick(typed);
                    if (r.ok && r.data) {
                      const created = { id: r.data.id, name: r.data.name };
                      setLocalCategories((prev) => [...prev, created]);
                      form.setValue("categoryId", created.id);
                      toast.success(`Added category "${created.name}"`);
                    } else if (!r.ok) {
                      toast.error(r.error);
                    }
                  }}
                  createLabel={(typed) => `Add category "${typed}"`}
                />
              </Row>
              <Row label="Default supplier">
                <Combobox
                  value={form.watch("defaultSupplierId") || null}
                  onChange={(v) => form.setValue("defaultSupplierId", v ?? undefined)}
                  placeholder="Pick supplier"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Row>
            </div>
            {/* Free-text product-family tag — items tagged the same family
                roll up together on the family detail page so the user can
                see "I have N kg of substance X" across SKUs, pack sizes,
                and suppliers. Datalist surfaces existing tags so we don't
                fragment "Calnit" / "calnit" / "Meroke Calnit". */}
            <Row label="Product family (optional)">
              <Input
                {...form.register("productFamily")}
                placeholder="e.g. Meroke Calnit, Rockwool, AB Mix"
                list="product-family-datalist"
              />
              {familyOptions && familyOptions.length > 0 ? (
                <datalist id="product-family-datalist">
                  {familyOptions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                Groups items that are the same substance across different
                bag sizes and suppliers. Total kilograms / litres / pieces
                roll up on the family page.
              </p>
            </Row>
            <Row label="Location">
              <Input {...form.register("location")} placeholder="Warehouse A" />
            </Row>
            <Row label="Shop URL">
              <Input {...form.register("shopeeUrl")} placeholder="https://shopee.tld/..." />
            </Row>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Reusable (asset)</Label>
              <Switch checked={form.watch("reusable")} onCheckedChange={(v) => form.setValue("reusable", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
