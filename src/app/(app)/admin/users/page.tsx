import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserTableActions } from "@/app/(app)/admin/users/user-table-actions";
import { CreateUserDialog } from "@/app/(app)/admin/users/create-user-dialog";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const session = await auth();
  // Hide the page entirely from non-superusers — `notFound()` returns a 404
  // rather than leaking that the route exists.
  if (!session?.user || session.user.role !== "SUPERUSER") notFound();

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      staff: { select: { id: true, name: true } },
    },
  });

  type Row = (typeof users)[number];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage logins. Only superusers see this page. To onboard learners and
            send them portal logins, use{" "}
            <Link href="/students" className="underline underline-offset-2 hover:text-foreground">
              Students
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/students">
              <GraduationCap className="h-4 w-4" /> Students
            </Link>
          </Button>
          <CreateUserDialog />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Linked staff</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u: Row) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{u.email}</span>
                  </TableCell>
                  <TableCell>
                    {u.role === "SUPERUSER" ? (
                      <Badge variant="accent">Superuser</Badge>
                    ) : u.role === "PORTAL" ? (
                      <Badge variant="secondary">Portal</Badge>
                    ) : (
                      <Badge variant="outline">User</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.staff ? u.staff.name : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserTableActions
                      user={{ id: u.id, name: u.name ?? "", email: u.email, role: u.role }}
                      isSelf={u.id === session.user.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Default password</strong> for newly-provisioned
            staff logins is <code>Jasper1.0!</code>. Use the <strong>Reset password</strong>
            action above to give an existing user a new password. Tell the user to sign in,
            then change it themselves later (no in-app change-password screen yet — flag if you
            want one built).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
