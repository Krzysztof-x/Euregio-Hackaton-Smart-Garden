import { ArrowUp, RotateCcw, Sparkles, Sprout, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { aiErrorText, type AiError } from "../aiErrors";
import { useChat, type SensorSnapshot } from "../hooks/useChat";
import { useI18n } from "../i18n/context";
import type { TextKey } from "../i18n/translations";
import type { WeatherSummary } from "../weather";
import { ChatMarkdown } from "./ChatMarkdown";

const SUGGESTIONS: TextKey[] = ["chatSuggest1", "chatSuggest2", "chatSuggest3"];

/** A question another part of the page wants to ask (e.g. "Ask AI how it's doing"). */
export interface ChatRequest {
  id: number;
  question: string;
}

/** Floating "Plant assistant" button + chat window. */
export function ChatPanel({
  sensors,
  weather,
  request,
}: {
  sensors: SensorSnapshot;
  weather: WeatherSummary | null;
  request: ChatRequest | null;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { messages, pending, usage, error, send, clear, refreshUsage } = useChat(sensors, weather);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const dayLimitReached = usage !== null && usage.remainingToday <= 0;

  // When opening: load the remaining questions and put the cursor in the input
  useEffect(() => {
    if (!open) return;
    void refreshUsage();
    inputRef.current?.focus();
  }, [open, refreshUsage]);

  // Always show the newest message
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, error]);

  // Opened from somewhere else with a ready-made question: open and ask it
  useEffect(() => {
    if (!request) return;
    setOpen(true);
    ask(request.question);
    // only when a new request arrives
  }, [request?.id]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }

  function ask(text: string) {
    if (!text.trim() || pending || dayLimitReached) return;
    void send(text);
    setDraft("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  // Enter sends, Shift+Enter makes a new line
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask(draft);
    }
  }

  const notice: AiError | null = error ?? (dayLimitReached ? { code: "limit_day" } : null);

  if (!open) {
    return (
      <button ref={fabRef} type="button" className="chat-fab" onClick={() => setOpen(true)}>
        <Sparkles size={18} aria-hidden="true" />
        <span>{t("chatOpen")}</span>
      </button>
    );
  }

  return (
    <section
      className="chat"
      role="dialog"
      aria-labelledby="chat-title"
      onKeyDown={(event) => event.key === "Escape" && close()}
    >
      <header className="chat-head">
        <span className="chat-avatar">
          <Sprout size={18} aria-hidden="true" />
        </span>
        <div className="chat-head-text">
          <h2 id="chat-title">{t("chatTitle")}</h2>
          <p>{t("chatSubtitle")}</p>
        </div>
        <button
          type="button"
          className="icon-btn is-quiet"
          onClick={clear}
          disabled={messages.length === 0 || pending}
          aria-label={t("chatClear")}
          title={t("chatClear")}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn is-quiet" onClick={close} aria-label={t("chatClose")} title={t("chatClose")}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        <div className="msg is-assistant">
          <p>{t("chatWelcome")}</p>
        </div>

        {messages.length === 0 && (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((key) => (
              <button key={key} type="button" onClick={() => ask(t(key))} disabled={pending || dayLimitReached}>
                {t(key)}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`msg is-${message.role}${message.failed ? " is-failed" : ""}`}>
            {message.role === "assistant" ? <ChatMarkdown text={message.text} /> : <p>{message.text}</p>}
          </div>
        ))}

        {pending && (
          <div className="msg is-assistant is-typing" aria-label={t("chatThinking")}>
            <span className="typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      {notice && (
        <p className="chat-notice" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {aiErrorText(notice, usage, i18n)}
        </p>
      )}

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={1000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("chatPlaceholder")}
          aria-label={t("chatPlaceholder")}
          disabled={dayLimitReached}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!draft.trim() || pending || dayLimitReached}
          aria-label={t("chatSend")}
          title={t("chatSend")}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>

      {usage && <p className="chat-usage">{t("chatLeft", { count: usage.remainingToday, limit: usage.limitPerDay })}</p>}
    </section>
  );
}
