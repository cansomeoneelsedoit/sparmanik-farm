"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateCourse } from "@/app/(app)/training/actions";
import {
  grantEnrollment,
  revokeEnrollment,
  type EnrollmentRow,
} from "@/app/(app)/training/enrollment-actions";

/** Builder-side page — plain English, like the rest of the course builder. */

type CourseInfo = {
  id: string;
  titleEn: string;
  titleId: string;
  description: string | null;
  /** Whole-Rupiah digit string, or null = free. */
  priceIdr: string | null;
};

const fmtRp = (v: string) => "Rp " + Number(v).toLocaleString("id-ID");

/** Keep only digits — lets Boyd paste "150.000" or "Rp 150000". */
const digitsOnly = (v: string) => v.replace(/\D/g, "");

export function AccessClient({
  course,
  enrollments,
}: {
  course: CourseInfo;
  enrollments: EnrollmentRow[];
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();

  // Decimal(18,4) can arrive as "150000" — normalise via Number just in case.
  const initialPrice = course.priceIdr ? String(Math.round(Number(course.priceIdr))) : "";
  const [price, setPrice] = useState(initialPrice);

  const [email, setEmail] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidVia, setPaidVia] = useState("");
  const [note, setNote] = useState("");

  function savePrice() {
    startT(async () => {
      // updateCourse revalidates titles too — send the current ones through
      // unchanged so the price save can't clobber them.
      const r = await updateCourse(course.id, {
        titleEn: course.titleEn,
        titleId: course.titleId,
        description: course.description,
        priceIdr: price === "" || Number(price) === 0 ? null : price,
      });
      if (r.ok) {
        toast.success(price === "" || Number(price) === 0 ? "Course is now free" : `Price saved: ${fmtRp(price)}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function grant(e: React.FormEvent) {
    e.preventDefault();
    startT(async () => {
      const r = await grantEnrollment({
        courseId: course.id,
        email: email.trim(),
        paidAmount: paidAmount === "" ? null : paidAmount,
        paidVia: paidVia.trim() || null,
        note: note.trim() || null,
      });
      if (r.ok) {
        toast.success(`Enrolled ${email.trim()}`);
        setEmail("");
        setPaidAmount("");
        setPaidVia("");
        setNote("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function revoke(row: EnrollmentRow) {
    startT(async () => {
      const r = await revokeEnrollment(row.id);
      if (r.ok) {
        toast.success(`Revoked access for ${row.userEmail}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/training/${course.id}/edit`}>
            <ArrowLeft className="h-4 w-4" /> Course builder
          </Link>
        </Button>
        <h1 className="font-serif text-3xl">Access &amp; price</h1>
        <p className="mt-1 text-sm text-muted-foreground">{course.titleEn}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            Leave empty (or 0) for a free course. A priced course is visible to
            everyone, but its modules only open for enrolled learners — record
            payments below.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="course-price">Price (Rp)</Label>
              <Input
                id="course-price"
                inputMode="numeric"
                className="w-44"
                placeholder="Free"
                value={price}
                onChange={(e) => setPrice(digitsOnly(e.target.value))}
              />
            </div>
            <Button onClick={savePrice} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <span className="pb-2 text-sm text-muted-foreground">
              {price === "" || Number(price) === 0 ? "Free course" : fmtRp(price)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrol a learner</CardTitle>
          <p className="pt-1 text-xs text-muted-foreground">
            The learner needs a login first (Admin → Users — role &ldquo;Portal
            (education only)&rdquo; for outside learners). Leave the amount empty
            to grant free access. Re-enrolling the same email just updates the
            payment details.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={grant} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="grant-email">Email</Label>
                <Input
                  id="grant-email"
                  type="email"
                  required
                  placeholder="learner@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-amount">Amount paid (Rp, optional)</Label>
                <Input
                  id="grant-amount"
                  inputMode="numeric"
                  placeholder="Granted free"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(digitsOnly(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-via">Paid via (optional)</Label>
                <Input
                  id="grant-via"
                  placeholder="cash / transfer / granted"
                  value={paidVia}
                  onChange={(e) => setPaidVia(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-note">Note (optional)</Label>
                <Input
                  id="grant-note"
                  placeholder="e.g. paid at the farm 12 Jul"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              <UserPlus className="h-4 w-4" /> {pending ? "Saving…" : "Enrol"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrolled ({enrollments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {enrollments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No one is enrolled yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Via</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-16 text-right">Revoke</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block font-medium">{row.userName ?? "—"}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {row.userEmail}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.paidAmount ? fmtRp(row.paidAmount) : <span className="text-muted-foreground">Granted</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.paidVia ?? "—"}</TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={row.note ?? undefined}>
                      {row.note ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => revoke(row)}
                        title={`Revoke access for ${row.userEmail}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
