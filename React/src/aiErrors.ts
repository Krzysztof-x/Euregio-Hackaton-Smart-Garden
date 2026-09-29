import type { I18n } from "./i18n/context";

/** Remaining AI requests, sent by the server with every /api response. */
export interface AiUsage {
  usedToday: number;
  limitPerDay: number;
  remainingToday: number;
  /** when the daily limit resets (ms timestamp) */
  resetsAt: number;
}

export interface AiError {
  code: "limit_day" | "limit_minute" | "limit_google" | "busy" | "no_key" | "not_a_plant" | "generic";
  retryAfter?: number;
}

const KNOWN_CODES: AiError["code"][] = ["limit_day", "limit_minute", "limit_google", "busy", "no_key", "not_a_plant"];

/** Turns the server's { error, retryAfter } into an AiError. */
export function toAiError(data: { error?: string; retryAfter?: number }): AiError {
  const code = KNOWN_CODES.find((known) => known === data.error) ?? "generic";
  return { code, retryAfter: data.retryAfter };
}

/** The message shown to the user for an AI error, in the current language. */
export function aiErrorText(error: AiError, usage: AiUsage | null, { t, formatTime }: I18n): string {
  switch (error.code) {
    case "limit_day":
      return t("chatErrorDay", { time: usage ? formatTime(usage.resetsAt) : "–" });
    case "limit_minute":
      return t("chatErrorMinute", { seconds: error.retryAfter ?? 60 });
    case "limit_google":
      return t("chatErrorGoogle");
    case "busy":
      return t("chatErrorBusy");
    case "no_key":
      return t("chatErrorKey");
    case "not_a_plant":
      return t("plantNotAPlant");
    default:
      return t("chatErrorGeneric");
  }
}
