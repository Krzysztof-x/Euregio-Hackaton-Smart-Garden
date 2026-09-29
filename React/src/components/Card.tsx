import { ChartLine, Table2, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { STALE_AFTER_MS } from "../config";
import { useI18n } from "../i18n/context";

export type View = "chart" | "table";

/** True when the last reading is older than STALE_AFTER_MS (sensor probably offline). */
export function isStale(lastTime: number | undefined, now: number): boolean {
  return lastTime !== undefined && now - lastTime > STALE_AFTER_MS;
}

interface CardProps {
  title: string;
  icon: LucideIcon;
  color: string;
  lastTime?: number;
  now: number;
  view: View;
  onToggleView: () => void;
  children: ReactNode;
}

/** The frame every sensor card shares: icon, title, "updated ..." and the chart/table switch. */
export function Card({ title, icon: Icon, color, lastTime, now, view, onToggleView, children }: CardProps) {
  const { t, formatAgo } = useI18n();
  const stale = isStale(lastTime, now);
  const toggleLabel = view === "chart" ? t("showTable") : t("showChart");

  return (
    <section className="card" aria-label={title}>
      <header className="card-head">
        <span className="card-icon" style={{ "--c": color } as CSSProperties}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <h2 className="card-title">{title}</h2>
        <div className="card-meta">
          {lastTime !== undefined && (
            <span className={stale ? "updated is-stale" : "updated"}>
              {stale && <TriangleAlert size={14} aria-hidden="true" />}
              {t(stale ? "lastData" : "updated", { time: formatAgo(lastTime, now) })}
            </span>
          )}
          <button type="button" className="icon-btn is-quiet" onClick={onToggleView} aria-label={toggleLabel} title={toggleLabel}>
            {view === "chart" ? <Table2 size={16} aria-hidden="true" /> : <ChartLine size={16} aria-hidden="true" />}
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}

/** Big number + unit at the top of a card. */
export function CardValue({ value, unit, stale }: { value: string; unit?: string; stale: boolean }) {
  return (
    <div className={stale ? "card-value is-stale" : "card-value"}>
      <span className="card-value-number">{value}</span>
      {unit && <span className="card-value-unit">{unit}</span>}
    </div>
  );
}

/** Shown instead of the chart until the first reading arrives. */
export function WaitingForData() {
  const { t } = useI18n();
  return <div className="waiting">{t("waiting")}</div>;
}
