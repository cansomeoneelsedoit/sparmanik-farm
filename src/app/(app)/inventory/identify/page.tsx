import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IdentifyClient } from "@/app/(app)/inventory/identify/identify-client";

export const dynamic = "force-dynamic";

export default function IdentifyItemPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory">
              <ArrowLeft className="h-4 w-4" /> Inventory
            </Link>
          </Button>
          <div>
            <h1 className="font-serif text-3xl">Identify an item</h1>
            <p className="text-sm text-muted-foreground">
              Snap or upload a photo of something in front of you. We&apos;ll
              compare it to your inventory and show the most likely matches.
            </p>
          </div>
        </div>
      </header>
      <IdentifyClient />
    </div>
  );
}
