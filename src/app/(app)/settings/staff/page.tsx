import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddStaffDialog } from "@/app/(app)/staff/add-staff-dialog";
import { StaffCardActions } from "@/app/(app)/staff/staff-card-actions";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  type Row = {
    id: string;
    name: string;
    role: string | null;
    avatar: string | null;
    rates: { rate: { toFixed(d: number): string } }[];
  };
  const rows = staff as Row[];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Staff</CardTitle>
        <AddStaffDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add staff
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No staff yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Current rate</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.role ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {s.rates[0] ? <Money value={s.rates[0].rate.toFixed(4)} /> : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <StaffCardActions
                      staff={{ id: s.id, name: s.name, role: s.role, avatar: s.avatar }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
