import Link from "next/link";

import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Event = {
  date: string; // YYYY-MM-DD
  text: string;
  href: string;
  kind: "harvest" | "task";
  priority?: "LOW" | "MEDIUM" | "HIGH";
};

function buildMonthGrid(year: number, month0: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month0, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // start on Sunday
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month0 });
  }
  return cells;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const { y, m } = await searchParams;
  const now = new Date();
  const year = y ? Number(y) : now.getFullYear();
  const month0 = m ? Number(m) - 1 : now.getMonth();
  const monthName = new Date(year, month0).toLocaleString("en", { month: "long", year: "numeric" });

  const monthStart = new Date(year, month0, 1);
  const monthEnd = new Date(year, month0 + 1, 0);

  const [harvests, tasks] = await Promise.all([
    prisma.harvest.findMany({
      where: { startDate: { gte: monthStart, lte: monthEnd } },
      select: { id: true, name: true, startDate: true },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: monthStart, lte: monthEnd } },
      select: { id: true, title: true, dueDate: true, priority: true, status: true },
    }),
  ]);

  const events: Event[] = [
    ...harvests.map((h: { id: string; name: string; startDate: Date }) => ({
      date: h.startDate.toISOString().slice(0, 10),
      text: `Harvest: ${h.name}`,
      href: `/harvest/${h.id}`,
      kind: "harvest" as const,
    })),
    ...tasks.map((t: { id: string; title: string; dueDate: Date; priority: "LOW" | "MEDIUM" | "HIGH" }) => ({
      date: t.dueDate.toISOString().slice(0, 10),
      text: t.title,
      href: `/tasks`,
      kind: "task" as const,
      priority: t.priority,
    })),
  ];

  const byDate = new Map<string, Event[]>();
  for (const e of events) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }

  const cells = buildMonthGrid(year, month0);
  const prev = month0 === 0 ? { y: year - 1, m: 12 } : { y: year, m: month0 };
  const next = month0 === 11 ? { y: year + 1, m: 1 } : { y: year, m: month0 + 2 };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href={`/calendar?y=${prev.y}&m=${prev.m}`}>‹ Prev</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href="/calendar">Today</Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href={`/calendar?y=${next.y}&m=${next.m}`}>Next ›</Link></Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>{monthName}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px rounded-md bg-border text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-muted/60 p-2 text-center font-medium">{d}</div>
            ))}
            {cells.map((cell, idx) => {
              const iso = cell.date.toISOString().slice(0, 10);
              const cellEvents = byDate.get(iso) ?? [];
              const isToday = iso === now.toISOString().slice(0, 10);
              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[100px] bg-background p-2",
                    !cell.inMonth && "bg-muted/30 text-muted-foreground",
                    isToday && "ring-2 ring-accent",
                  )}
                >
                  <div className="mb-1 text-right text-xs font-medium">{cell.date.getDate()}</div>
                  <div className="space-y-1">
                    {cellEvents.slice(0, 3).map((e, i) => (
                      <Link
                        key={i}
                        href={e.href}
                        className={cn(
                          "block truncate rounded px-1 py-0.5 text-[10px]",
                          e.kind === "harvest" && "bg-accent/15 text-accent",
                          e.kind === "task" && e.priority === "HIGH" && "bg-destructive/15 text-destructive",
                          e.kind === "task" && e.priority === "MEDIUM" && "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
                          e.kind === "task" && e.priority === "LOW" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                        )}
                      >
                        {e.text}
                      </Link>
                    ))}
                    {cellEvents.length > 3 ? <div className="text-[10px] text-muted-foreground">+{cellEvents.length - 3} more</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 text-xs">
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-accent" /> Harvest start</div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-destructive" /> High-priority task</div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> Medium-priority task</div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Low-priority task</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Google Calendar two-way sync arrives in Phase 6 once <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are configured in your environment.
        </CardContent>
      </Card>
    </div>
  );
}
