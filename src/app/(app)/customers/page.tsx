import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { MoneyDual } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/app/(app)/customers/customer-form-dialog";
import {
  CustomersListClient,
  type CustomerRow,
} from "@/app/(app)/customers/customers-list-client";

export const dynamic = "force-dynamic";

/**
 * Customers — who we sell to (the sell-side mirror of Suppliers). Add/edit
 * here, or create ad-hoc from the Log-sale dialog. Type (Retailer /
 * Wholesaler / Consumer) drives later reporting.
 */
export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    // select (not include) so the logo BYTES never load into the list query —
    // we only need logoMime to know whether a logo exists.
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      email: true,
      notes: true,
      logoMime: true,
    },
  });

  type CustomerLite = {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    logoMime: string | null;
  };
  const list = customers as CustomerLite[];

  // Sales totals via one aggregate query instead of loading every sale per
  // customer (app review #67). Sale is org-scoped and we filter by these ids.
  const salesAgg = (await prisma.sale.groupBy({
    by: ["customerId"],
    where: { customerId: { in: list.map((c) => c.id) } },
    _sum: { amount: true },
    _count: { _all: true },
    _max: { date: true },
  })) as Array<{
    customerId: string | null;
    _sum: { amount: Decimal | null };
    _count: { _all: number };
    _max: { date: Date | null };
  }>;
  const salesByCustomer = new Map(salesAgg.map((a) => [a.customerId, a]));

  const rows: CustomerRow[] = list.map((c) => {
    const agg = salesByCustomer.get(c.id);
    const total = agg?._sum.amount ?? new Decimal(0);
    const lastSale = agg?._max.date ? agg._max.date.toISOString().slice(0, 10) : null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      hasLogo: !!c.logoMime,
      salesCount: agg?._count._all ?? 0,
      totalDisplay: <MoneyDual value={new Decimal(total).toFixed(4)} align="start" />,
      lastSale,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Who you sell to — retailers, wholesalers, consumers. Search, add, or edit their type.
          </p>
        </div>
        <CustomerFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Add customer
            </Button>
          }
        />
      </header>

      <CustomersListClient customers={rows} />
    </div>
  );
}
