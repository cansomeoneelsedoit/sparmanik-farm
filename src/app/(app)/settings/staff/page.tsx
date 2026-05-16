import { prisma } from "@/server/prisma";
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

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Staff</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Current rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(staff as { id: string; name: string; role: string | null; rates: { rate: { toFixed(d: number): string } }[] }[]).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.role ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {s.rates[0] ? <Money value={s.rates[0].rate.toFixed(4)} /> : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
