import { CircleCheck, TriangleAlert } from "lucide-react";
import type { AnalogPoint } from "../hooks/useGardenData";
import { useI18n } from "../i18n/context";
import { rangeStatus, type Range } from "../plant";

const MOISTURE_TEXT = { dry: "moistureDry", good: "moistureGood", wet: "moistureWet" } as const;

/** "Good / Too dry / Very wet" badge - judged by the plant's range (or the default range). */
export function MoistureBadge({ percent, range }: { percent: number; range: Range }) {
  const { t } = useI18n();
  const status = { low: "dry", ok: "good", high: "wet" }[rangeStatus(percent, range)] as keyof typeof MOISTURE_TEXT;
  const Icon = status === "good" ? CircleCheck : TriangleAlert;
  return (
    <span className={`badge is-${status}`}>
      <Icon size={14} aria-hidden="true" />
      {t(MOISTURE_TEXT[status])}
    </span>
  );
}

/** Voltage and raw ADC value measured by the ESP32 ("Voltage 1.41 V · Raw 27974"). */
export function AnalogDetails({ point }: { point: AnalogPoint }) {
  const { t, formatNumber } = useI18n();
  const details = [
    point.voltage !== null ? `${t("voltage")} ${formatNumber(point.voltage, 2)} V` : null,
    point.raw !== null ? `${t("raw")} ${point.raw}` : null,
  ].filter(Boolean);

  return details.length > 0 ? <span className="card-detail">{details.join(" · ")}</span> : null;
}
