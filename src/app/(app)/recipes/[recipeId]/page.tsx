import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecipeFormDialog } from "@/app/(app)/recipes/recipe-form-dialog";
import { DeleteRecipeButton } from "@/app/(app)/recipes/[recipeId]/delete-recipe-button";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  const r = await prisma.nutrientRecipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true },
  });
  if (!r) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/recipes"><ArrowLeft className="h-4 w-4" /> Recipes</Link>
          </Button>
          <h1 className="font-serif text-3xl">{r.name}</h1>
        </div>
        <div className="flex gap-2">
          <RecipeFormDialog
            existing={{ ...r, ec: r.ec ?? null, ingredients: r.ingredients.map((i: { name: string; amount: string }) => ({ name: i.name, amount: i.amount })) }}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <DeleteRecipeButton id={r.id} name={r.name} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex gap-2">
            {r.crop ? <Badge variant="secondary">{r.crop}</Badge> : null}
            {r.stage ? <Badge variant="secondary">{r.stage}</Badge> : null}
            {r.ec ? <Badge variant="outline">EC {r.ec.toFixed(2)}</Badge> : null}
            {r.ph ? <Badge variant="outline">pH {r.ph}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.notes ? (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
              <p className="whitespace-pre-wrap text-sm">{r.notes}</p>
            </div>
          ) : null}
          <div>
            <CardTitle className="mb-3 text-base">Ingredients</CardTitle>
            {r.ingredients.length === 0 ? (
              <div className="text-sm text-muted-foreground">No ingredients yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {(r.ingredients as { id: string; name: string; amount: string }[]).map((i) => (
                  <li key={i.id} className="flex items-center justify-between border-b py-2">
                    <span>{i.name}</span>
                    <span className="font-mono text-muted-foreground">{i.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
