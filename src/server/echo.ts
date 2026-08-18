import { askAi, availableProviders, type ChatMessage } from "@/server/ai";

/**
 * One-off quick lookup. Single-turn — no history, no attachments. The
 * existing askAi() system prompt already tells the model to be concise, so
 * we just delegate. Echo is the UI-side: a floating widget for fast
 * factual questions ("how much rockwool do I have?") that doesn't take up
 * the whole page like /ask-ai.
 */
export async function askEcho(question: string): Promise<string> {
  const providers = await availableProviders();
  if (providers.length === 0) {
    throw new Error("Add an AI key under Settings → AI keys to enable Echo.");
  }
  // Prefer the ranked chain (auto) — it's what the user configured.
  const provider = providers.includes("auto") ? "auto" : providers.includes("claude") ? "claude" : providers[0];
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: `Answer in one or two sentences. Question: ${question}`,
    },
  ];
  return askAi(provider, messages);
}
