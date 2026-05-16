"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Alert } from "@/server/alerts";
import { cn } from "@/lib/utils";

export function AlertBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <Bell className="h-4 w-4" />
          {alerts.length > 0 ? (
            <Badge
              variant={critical > 0 ? "destructive" : "accent"}
              className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-[10px]"
            >
              {alerts.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Alerts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">No alerts</div>
        ) : (
          alerts.slice(0, 10).map((a) => (
            <DropdownMenuItem key={a.id} asChild>
              <Link href={a.href} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                    a.severity === "critical" && "bg-destructive",
                    a.severity === "warning" && "bg-yellow-500",
                    a.severity === "low" && "bg-accent",
                  )}
                />
                <span className="text-xs">{a.text}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
