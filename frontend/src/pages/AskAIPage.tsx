import { useState, useEffect, useRef, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { aiApi } from "@/api/sops";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTED_EN = [
  "How much revenue did we make last week?",
  "Which inventory items are out of stock?",
  "Show me the recipe for fruiting melon",
  "Who has tasks due today?",
  "What is our biggest expense category?",
];

const SUGGESTED_ID = [
  "Berapa pendapatan kami minggu lalu?",
  "Item inventaris apa yang habis?",
  "Tunjukkan resep untuk melon berbuah",
  "Siapa yang punya tugas hari ini?",
  "Apa kategori pengeluaran terbesar kami?",
];

export function AskAIPage() {
  const { t, lang } = useI18n();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiApi.status().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [history, thinking]);

  async function ask(question: string) {
    if (!question.trim() || thinking) return;
    const next = [...history, { role: "user" as const, text: question }];
    setHistory(next);
    setInput("");
    setThinking(true);
    try {
      const res = await aiApi.chat(question, history, lang);
      setHistory([...next, { role: "assistant" as const, text: res.text }]);
    } catch (e) {
      setHistory([
        ...next,
        { role: "assistant" as const, text: `Error: ${(e as Error).message}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  const suggestions = lang === "id" ? SUGGESTED_ID : SUGGESTED_EN;

  return (
    <div className="p-5 lg:p-10">
      <div className="mb-4">
        <div className="mono mb-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {t("aichat")}
        </div>
        <h1 className="serif text-4xl lg:text-5xl">{t("ask_anything")}</h1>
      </div>

      {configured === false && (
        <div
          className="card mb-4 p-4"
          style={{ background: "rgba(255,184,77,0.06)", borderColor: "rgba(255,184,77,0.3)" }}
        >
          <div className="text-sm" style={{ color: "#FFB84D" }}>
            ⚠ {t("ai_not_configured")}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="card mb-4 p-5"
        style={{ minHeight: 400, maxHeight: "60vh", overflowY: "auto" }}
      >
        {history.length === 0 ? (
          <div className="text-center" style={{ padding: "30px 20px" }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>💬</div>
            <div className="mb-4 text-sm" style={{ color: "var(--text-dim)" }}>{t("chat_intro")}</div>
            <div className="mono mb-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {t("suggested_questions")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 480, margin: "0 auto" }}>
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="btn btn-ghost text-sm"
                  style={{ textAlign: "left", justifyContent: "flex-start" }}
                  disabled={configured === false}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {history.map((m, i) => (
              <div key={i}>
                {m.role === "user" ? (
                  <div className="mb-3 flex justify-end">
                    <div
                      style={{
                        maxWidth: "80%",
                        background: "linear-gradient(135deg,#FF6B35,#FF8555)",
                        color: "white",
                        padding: "12px 16px",
                        borderRadius: "16px 16px 4px 16px",
                      }}
                    >
                      <div className="text-sm">{m.text}</div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 flex items-start gap-3">
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: "linear-gradient(135deg,#A78BFA,#60A5FA)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 14,
                      }}
                    >
                      ✨
                    </div>
                    <div
                      style={{
                        maxWidth: "80%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        padding: "12px 16px",
                        borderRadius: "4px 16px 16px 16px",
                      }}
                    >
                      <div className="text-sm" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="mb-4 flex items-start gap-3">
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: "linear-gradient(135deg,#A78BFA,#60A5FA)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 14,
                  }}
                >
                  ✨
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border)",
                    padding: "12px 16px",
                    borderRadius: "4px 16px 16px 16px",
                  }}
                >
                  <div className="text-sm" style={{ color: "var(--text-dim)" }}>{t("thinking")}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat_placeholder")}
          autoComplete="off"
          style={{ flex: 1 }}
          disabled={thinking || configured === false}
        />
        <button type="submit" className="btn btn-primary" disabled={thinking || configured === false}>
          {t("send")}
        </button>
        {history.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setHistory([])}
            disabled={thinking}
          >
            {t("clear_chat")}
          </button>
        )}
      </form>
    </div>
  );
}
