import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/server/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecipeFormDialog } from "@/app/(app)/recipes/recipe-form-dialog";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await prisma.nutrientRecipe.findMany({
    orderBy: { name: "asc" },
    include: { ingredients: true },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Nutrient recipes</h1>
        <RecipeFormDialog trigger={<Button><Plus className="h-4 w-4" /> New recipe</Button>} />
      </header>

      {recipes.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No recipes yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(recipes as { id: string; name: string; crop: string | null; stage: string | null; ec: { toFixed(d: number): string } | null; ph: string | null; ingredients: { id: string }[] }[]).map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`}>
              <Card className="cursor-pointer transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="font-serif">{r.name}</CardTitle>
                  <div className="text-xs text-muted-foreground">{[r.crop, r.stage].filter(Boolean).join(" · ") || "—"}</div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    {r.ec ? <Badge variant="secondary">EC {r.ec.toFixed(2)}</Badge> : null}
                    {r.ph ? <Badge variant="secondary">pH {r.ph}</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
