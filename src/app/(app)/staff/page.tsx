import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Decimal } from "@/server/decimal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { AddStaffDialog } from "@/app/(app)/staff/add-staff-dialog";
import { NewWageEntryDialog } from "@/app/(app)/staff/new-wage-entry-dialog";
import { AddPayRiseButton } from "@/app/(app)/staff/add-pay-rise-button";
import { EditPayButton } from "@/app/(app)/staff/edit-pay-button";
import { StaffCardActions } from "@/app/(app)/staff/staff-card-actions";

export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  name: string;
  role: string | null;
  avatar: string | null;
  photoPath: string | null;
  bio: string | null;
  rates: { rate: Decimal; effectiveFrom: Date }[];
  wageEntries: { totalHours: Decimal; date: Date; lines: { hours: Decimal; harvestId: string | null }[] }[];
};

export default async function StaffPage() {
  const [staff, harvests, greenhouses] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      include: {
        rates: { orderBy: { effectiveFrom: "desc" } },
        wageEntries: { orderBy: { date: "desc" }, include: { lines: true } },
      },
    }),
    prisma.harvest.findMany({ where: { status: "LIVE" }, select: { id: true, name: true } }),
    prisma.greenhouse.findMany({ select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Staff</h1>
        <div className="flex gap-2">
          <NewWageEntryDialog
            staff={(staff as StaffRow[]).map((s) => ({ id: s.id, name: s.name }))}
            harvests={harvests.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name }))}
            greenhouses={greenhouses.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))}
          />
          <AddStaffDialog trigger={<Button><Plus className="h-4 w-4" /> Add staff</Button>} />
        </div>
      </header>

      {staff.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No staff yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(staff as StaffRow[]).map((s) => {
            const currentRate = s.rates[0]?.rate.toFixed(0) ?? "—";
            const totalHours = s.wageEntries.reduce((sum: Decimal, w) => sum.plus(w.totalHours), new Decimal(0));
            const days = new Set(s.wageEntries.map((w) => w.date.toISOString().slice(0, 10))).size;
            const totalEarned = s.wageEntries.reduce((sum: Decimal, w) => {
              // best-effort: use current rate for all hours; full rate-history math in /staff/[id]
              return sum.plus(new Decimal(w.totalHours).times(s.rates[0]?.rate ?? new Decimal(0)));
            }, new Decimal(0));

            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {s.photoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/uploads/${s.photoPath}`}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-full border object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg font-semibold text-accent">
                          {s.avatar ?? s.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.role ?? "—"}</div>
                      </div>
                    </div>
                    <StaffCardActions staff={{ id: s.id, name: s.name, role: s.role, avatar: s.avatar, photoPath: s.photoPath, bio: s.bio }} />
                  </div>
                  {s.bio ? (
                    <p className="line-clamp-3 whitespace-pre-line rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      {s.bio}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
                    <div><div className="text-muted-foreground">Rate</div><div className="font-medium"><Money value={String(currentRate)} /></div></div>
                    <div><div className="text-muted-foreground">Hours</div><div className="font-medium">{totalHours.toFixed(0)}</div></div>
                    <div><div className="text-muted-foreground">Days</div><div className="font-medium">{days}</div></div>
                  </div>
                  <div className="border-t pt-3 text-xs">
                    <span className="text-muted-foreground">Total earned: </span>
                    <span className="font-medium"><Money value={totalEarned.toFixed(4)} /></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <EditPayButton staffId={s.id} currentRate={s.rates[0] ? s.rates[0].rate.toFixed(0) : ""} />
                    <AddPayRiseButton staffId={s.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
