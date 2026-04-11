import { useState, useEffect, useCallback } from "react";
import { recipesApi, type RecipeListItem, type Recipe } from "@/api/recipes";

export function useRecipesList() {
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await recipesApi.list();
      setItems(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}

export function useRecipe(id: number | null) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (id === null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await recipesApi.get(id);
      setRecipe(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id !== null) refresh();
  }, [id, refresh]);

  return { recipe, loading, error, refresh };
}
