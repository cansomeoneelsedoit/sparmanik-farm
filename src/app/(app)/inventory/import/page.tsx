import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportClient } from "@/app/(app)/inventory/import/import-client";

export const dynamic = "force-dynamic";

export default function InventoryImportPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/inventory">
            <ArrowLeft className="h-4 w-4" /> Inventory
          </Link>
        </Button>
        <div>
          <h1 className="font-serif text-3xl">Import from Excel</h1>
          <p className="text-sm text-muted-foreground">
            Upload a <code>.xlsx</code> or <code>.csv</code> file. The first sheet is read;
            column names are auto-matched (case-insensitive).
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="font-medium">Supported columns</div>
          <ul className="grid gap-1.5 text-muted-foreground sm:grid-cols-2">
            <li>
              <strong className="text-foreground">Name / Product</strong> — required.
              Also <em>Item Name</em>, <em>Product Name</em>, <em>Title</em>.
            </li>
            <li>
              <strong className="text-foreground">Variation</strong> — optional. Appended
              to the name so distinct variants land as distinct stock items
              (&ldquo;Box 15cm — MERAH&rdquo;).
            </li>
            <li>
              <strong className="text-foreground">Qty</strong> — optional. When set, a
              new <em>Batch</em> is created with this quantity. Also{" "}
              <em>Quantity</em>, <em>Pcs</em>, <em>Count</em>.
            </li>
            <li>
              <strong className="text-foreground">Unit Price</strong> — optional. Needs
              Qty to create a Batch. Strips currency markers (&ldquo;Rp 3,750&rdquo;
              fine).
            </li>
            <li>
              <strong className="text-foreground">Supplier / Shop</strong> — optional.
              Also <em>Vendor</em>, <em>Seller</em>. New suppliers auto-created.
            </li>
            <li>
              <strong className="text-foreground">Description</strong> — optional. Also{" "}
              <em>Notes</em>, <em>Details</em>, <em>Info</em>.
            </li>
            <li>
              <strong className="text-foreground">Category</strong> — optional. New
              categories are created on the fly.
            </li>
            <li>
              <strong className="text-foreground">Unit</strong> — defaults to{" "}
              <em>pcs</em>. Also <em>UOM</em>, <em>Measure</em>.
            </li>
            <li>
              <strong className="text-foreground">Reorder</strong> — optional. Min stock
              threshold for low-stock alerts.
            </li>
            <li>
              <strong className="text-foreground">Location</strong> — optional. Also{" "}
              <em>Store</em>, <em>Warehouse</em>.
            </li>
            <li>
              <strong className="text-foreground">Reusable</strong> — optional. Y/N for
              depreciable assets like rockwool / grow bags.
            </li>
            <li className="sm:col-span-2">
              <strong className="text-foreground">Embedded pictures</strong> — auto-extracted
              from sheet 1 drawings and attached to the matching row, even if the
              &ldquo;Picture&rdquo; column is empty in the cell data (Shopee exports
              work).
            </li>
          </ul>
        </CardContent>
      </Card>

      <ImportClient />
    </div>
  );
}
