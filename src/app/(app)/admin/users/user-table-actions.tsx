"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, KeyRound, Trash2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { updateUser, resetUserPassword, deleteUser } from "@/app/(app)/admin/users/actions";

const editSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["USER", "SUPERUSER"]),
});
type EditForm = z.infer<typeof editSchema>;

const resetSchema = z.object({ password: z.string().min(6) });
type ResetForm = z.infer<typeof resetSchema>;

export function UserTableActions({
  user,
  isSelf,
}: {
  user: { id: string; name: string; email: string; role: "USER" | "SUPERUSER" };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startT] = useTransition();

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, email: user.email, role: user.role },
  });
  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "Jasper1.0!" },
  });

  function onEdit(v: EditForm) {
    startT(async () => {
      const r = await updateUser(user.id, v);
      if (r.ok) { toast.success("Saved"); setEditOpen(false); router.refresh(); }
      else toast.error(r.error);
    });
  }

  function onReset(v: ResetForm) {
    startT(async () => {
      const r = await resetUserPassword(user.id, v);
      if (r.ok) { toast.success("Password reset"); setResetOpen(false); resetForm.reset({ password: "Jasper1.0!" }); }
      else toast.error(r.error);
    });
  }

  function onDelete() {
    startT(async () => {
      const r = await deleteUser(user.id);
      if (r.ok) { toast.success("Deleted"); setDeleteOpen(false); router.refresh(); }
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
        <Pencil className="h-3 w-3" /> Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
        <KeyRound className="h-3 w-3" /> Reset PW
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isSelf}
        onClick={() => setDeleteOpen(true)}
        title={isSelf ? "You can't delete yourself" : "Delete user"}
      >
        <Trash2 className="h-3 w-3" />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form onSubmit={editForm.handleSubmit(onEdit)}>
            <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name</Label><Input {...editForm.register("name")} autoFocus /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" {...editForm.register("email")} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.watch("role")} onValueChange={(v) => editForm.setValue("role", v as "USER" | "SUPERUSER")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="SUPERUSER">Superuser</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <form onSubmit={resetForm.handleSubmit(onReset)}>
            <DialogHeader><DialogTitle>Reset password — {user.name || user.email}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New password</Label>
                <Input {...resetForm.register("password")} autoFocus />
                <p className="text-xs text-muted-foreground">
                  Default <code>Jasper1.0!</code>. Tell the user verbally; we don't email it.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setResetOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Resetting…" : "Reset"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${user.name || user.email}?`}
        description="The user will no longer be able to sign in. Any linked staff record stays."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
