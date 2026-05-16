import { prisma } from "@/server/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryManager } from "@/app/(app)/settings/categories/category-manager";

export const dynamic = "force-dynamic";

export default async function CategoriesSettingsPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Inventory categories</CardTitle></CardHeader>
      <CardContent>
        <CategoryManager categories={categories.map((c: { id: string; name: string; _count: { items: number } }) => ({
          id: c.id, name: c.name, itemCount: c._count.items,
        }))} />
      </CardContent>
    </Card>
  );
}
