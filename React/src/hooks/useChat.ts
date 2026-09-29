import { useCallback, useState } from "react";
import { toAiError, type AiError, type AiUsage } from "../aiErrors";
import { useI18n } from "../i18n/context";
import type { WeatherSummary } from "../weather";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** true if this question got no answer (it isn't sent again as history) */
  failed?: boolean;
}

/** Latest sensor values the assistant may use (missing = sensor offline). */
export interface SensorSnapshot {
  temperature?: number;
  humidity?: number;
  moisture?: number;
  light?: number;
}

/** Sends questions to our server (/api/chat), which asks Gemini. The API key stays on the server. */
export function useChat(sensors: SensorSnapshot, weather: WeatherSummary | null) {
  const { lang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [error, setError] = useState<AiError | null>(null);

  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/usage");
      if (response.ok) setUsage(((await response.json()) as { usage: AiUsage }).usage);
    } catch {
      // server not reachable - shown when the user sends a question
    }
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;

    const id = Date.now();
    const history = [...messages.filter((m) => !m.failed), { id, role: "user" as const, text: question }];
    setMessages((prev) => [...prev, { id, role: "user", text: question }]);
    setPending(true);
    setError(null);

    let problem: AiError | null = null;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, sensors, weather, messages: history.map(({ role, text }) => ({ role, text })) }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
        retryAfter?: number;
        usage?: AiUsage;
      };
      if (data.usage) setUsage(data.usage);

      if (response.ok && data.reply) {
        setMessages((prev) => [...prev, { id: id + 1, role: "assistant", text: data.reply! }]);
      } else {
        problem = toAiError(data);
      }
    } catch {
      problem = { code: "generic" };
    }

    if (problem) {
      setError(problem);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, failed: true } : m)));
    }
    setPending(false);
  }

  function clear() {
    setMessages([]);
    setError(null);
  }

  return { messages, pending, usage, error, send, clear, refreshUsage };
}
