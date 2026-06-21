import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Money } from "@/components/shared/money";
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
      sales: { select: { amount: true, date: true } },
    },
  });

  type CustomerWithSales = {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    logoMime: string | null;
    sales: { amount: Decimal; date: Date }[];
  };

  const rows: CustomerRow[] = (customers as CustomerWithSales[]).map((c) => {
    const total = c.sales.reduce((s: Decimal, x) => s.plus(new Decimal(x.amount)), new Decimal(0));
    const lastSale = c.sales.length
      ? c.sales.map((x) => x.date).sort((a, b) => b.getTime() - a.getTime())[0].toISOString().slice(0, 10)
      : null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      hasLogo: !!c.logoMime,
      salesCount: c.sales.length,
      totalDisplay: <Money value={total.toFixed(4)} />,
      lastSale,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
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
