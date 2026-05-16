import { GoogleGenerativeAI, type Content, type Part } from "@google/generative-ai";

import { readUploadAsBase64 } from "@/server/uploads";
import type { ChatAttachment, ChatMessage } from "@/server/ai";

const SYSTEM_PROMPT = `You are the operations assistant for Sparmanik Farm, a hydroponic farm in Indonesia growing primarily melon, chili, and seasonal greens. You help the operator make decisions about inventory, harvests, tasks, staff scheduling, and nutrient recipes. Be concise (3-5 sentences unless detailed steps are requested), practical, and pragmatic. Use IDR (rupiah) for prices. When the user attaches a photo, describe what you see and answer their question using both the image and the farm context. When uncertain, ask for the missing detail rather than guessing.`;

const SUPPORTED_VISION_MEDIA: ReadonlySet<string> = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/gif",
]);

async function attachmentsToParts(attachments: ChatAttachment[] | undefined): Promise<Part[]> {
  if (!attachments || attachments.length === 0) return [];
  const parts: Part[] = [];
  for (const a of attachments) {
    if (!SUPPORTED_VISION_MEDIA.has(a.mimeType)) continue;
    const data = await readUploadAsBase64(a.path);
    parts.push({ inlineData: { data, mimeType: a.mimeType } });
  }
  return parts;
}

export async function askGemini(messages: ChatMessage[], context: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured. Set it in your .env to enable Gemini.");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: `${SYSTEM_PROMPT}\n\nCurrent farm state:\n${context}`,
  });

  // Build the multi-turn history. Gemini uses "user" / "model" roles.
  const contents: Content[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts: Part[] = [];
    if (m.role === "user") {
      parts.push(...(await attachmentsToParts(m.attachments)));
    }
    if (m.content) parts.push({ text: m.content });
    if (parts.length === 0) parts.push({ text: " " });
    contents.push({ role, parts });
  }

  const result = await model.generateContent({ contents });
  return result.response.text();
}
