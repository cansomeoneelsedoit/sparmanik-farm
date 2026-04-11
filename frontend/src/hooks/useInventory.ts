import { useState, useEffect, useCallback } from "react";
import { inventoryApi, type InventoryItem, type InventoryStats, type AdjustRequest } from "@/api/inventory";

export function useInventory(filters: { category?: string; search?: string } = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, s] = await Promise.all([
        inventoryApi.list(filters),
        inventoryApi.stats(),
      ]);
      setItems(list);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const adjust = useCallback(
    async (id: number, payload: AdjustRequest) => {
      // Optimistic: compute what the new quantity should be and update in place
      const current = items.find((i) => i.id === id);
      if (current) {
        const nextQty =
          payload.new_quantity !== undefined
            ? payload.new_quantity
            : Math.max(0, current.quantity + (payload.delta ?? 0));
        const optimistic: InventoryItem = {
          ...current,
          quantity: nextQty,
          status:
            nextQty <= 0 ? "out" : nextQty <= current.reorder_level ? "low" : "in_stock",
        };
        setItems((prev) => prev.map((i) => (i.id === id ? optimistic : i)));
      }
      try {
        const updated = await inventoryApi.adjust(id, payload);
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
        // Refresh stats in the background
        inventoryApi.stats().then(setStats).catch(() => {});
      } catch (e) {
        // Revert on failure
        refresh();
        throw e;
      }
    },
    [items, refresh]
  );

  return { items, stats, loading, error, refresh, adjust };
}
