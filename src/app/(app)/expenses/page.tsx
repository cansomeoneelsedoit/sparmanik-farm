import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyDual } from "@/components/shared/money";
import { DownloadCsvButton } from "@/components/shared/download-csv-button";
import { ExpenseFormDialog } from "@/app/(app)/expenses/expense-form-dialog";
import { ImportExpenseSheetDialog } from "@/app/(app)/expenses/import-expense-sheet-dialog";
import { ExpenseRowActions } from "@/app/(app)/expenses/expense-row-actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [expenses, harvests] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { date: "desc" },
      include: {
        harvest: { select: { id: true, name: true } },
      },
    }),
    prisma.harvest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      select: { id: true, name: true },
    }),
  ]);

  type ExpenseRow = {
    id: string;
    date: Date;
    amount: Decimal;
    category: string | null;
    payee: string;
    description: string | null;
    paymentMethod: string | null;
    receiptPath: string | null;
    harvestId: string | null;
    harvest: { id: string; name: string } | null;
  };
  const rows = expenses as ExpenseRow[];

  const total = rows.reduce((s: Decimal, e) => s.plus(e.amount), new Decimal(0));
  const assigned = rows
    .filter((e) => e.harvestId)
    .reduce((s: Decimal, e) => s.plus(e.amount), new Decimal(0));
  const overhead = total.minus(assigned);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            One-off costs paid to non-staff. Assign to a harvest to charge its
            P&amp;L, or leave blank for business overhead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadCsvButton type="expenses" />
          <ImportExpenseSheetDialog harvests={harvests} />
          <ExpenseFormDialog
            harvests={harvests}
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> New expense
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold">
              <MoneyDual value={total.toFixed(4)} align="start" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Charged to harvests</div>
            <div className="text-2xl font-semibold">
              <MoneyDual value={assigned.toFixed(4)} align="start" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Business overhead</div>
            <div className="text-2xl font-semibold">
              <MoneyDual value={overhead.toFixed(4)} align="start" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All expenses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No expenses yet. Click <strong>New expense</strong> to record one.
            </div>
          ) : (
            <>
              {/* Desktop table; tablet/phone card list (app review UX — tables). */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid to</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Harvest</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-muted-foreground">
                          {e.date.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{e.payee}</div>
                          {e.description ? (
                            <div className="line-clamp-1 text-xs text-muted-foreground">{e.description}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {e.category ? <Badge variant="outline">{e.category}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {e.harvest ? (
                            <Link
                              href={`/harvest/${e.harvest.id}`}
                              className="text-muted-foreground hover:underline"
                            >
                              {e.harvest.name}
                            </Link>
                          ) : (
                            <Badge variant="secondary">Overhead</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.paymentMethod ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          <MoneyDual value={e.amount.toFixed(4)} />
                        </TableCell>
                        <TableCell className="p-0">
                          <ExpenseRowActions
                            expense={{
                              id: e.id,
                              date: e.date.toISOString().slice(0, 10),
                              amount: e.amount.toFixed(2),
                              category: e.category,
                              payee: e.payee,
                              description: e.description,
                              harvestId: e.harvestId,
                              paymentMethod: e.paymentMethod,
                              receiptPath: e.receiptPath,
                            }}
                            harvests={harvests}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y lg:hidden">
                {rows.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">{e.payee}</div>
                      {e.description ? (
                        <div className="line-clamp-2 text-xs text-muted-foreground">{e.description}</div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{e.date.toISOString().slice(0, 10)}</span>
                        {e.category ? <Badge variant="outline">{e.category}</Badge> : null}
                        {e.harvest ? (
                          <Link href={`/harvest/${e.harvest.id}`} className="hover:underline">{e.harvest.name}</Link>
                        ) : (
                          <Badge variant="secondary">Overhead</Badge>
                        )}
                        {e.paymentMethod ? <span>· {e.paymentMethod}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="text-right font-medium">
                        <MoneyDual value={e.amount.toFixed(4)} />
                      </div>
                      <ExpenseRowActions
                        expense={{
                          id: e.id,
                          date: e.date.toISOString().slice(0, 10),
                          amount: e.amount.toFixed(2),
                          category: e.category,
                          payee: e.payee,
                          description: e.description,
                          harvestId: e.harvestId,
                          paymentMethod: e.paymentMethod,
                          receiptPath: e.receiptPath,
                        }}
                        harvests={harvests}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
