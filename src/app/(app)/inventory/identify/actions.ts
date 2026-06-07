"use server";

import { auth } from "@/auth";
import { identifyItem, type IdentifyResult } from "@/server/item-vision";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Run the visual identifier against the active org's inventory. The
 * image is never persisted — it's read into a buffer, sent to the
 * vision chain, and discarded. The structured result includes what the
 * AI thought it saw, the keywords it extracted, and a ranked list of
 * matches (AI-suggested first, keyword-fallback after).
 */
export async function identifyItemImage(
  formData: FormData,
): Promise<ActionResult<IdentifyResult>> {
  const s = await auth();
  if (!s?.user?.id) return { ok: false, error: "Not signed in" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await identifyItem(buffer);
    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message.includes("No AI provider")
            ? "AI isn't configured — add a key under Settings → AI keys."
            : e.message
          : "Identification failed",
    };
  }
}
