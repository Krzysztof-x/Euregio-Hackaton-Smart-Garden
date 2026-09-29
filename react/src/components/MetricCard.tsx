import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Scale } from "../chartScale";
import type { Point } from "../hooks/useGardenData";
import { useI18n } from "../i18n/context";
import { Card, CardValue, isStale, WaitingForData, type View } from "./Card";
import { ReadingsTable } from "./ReadingsTable";
import { TrendChart } from "./TrendChart";

interface MetricCardProps {
  title: string;
  icon: LucideIcon;
  color: string;
  unit: string;
  /** Decimal places shown, e.g. 1 for 21.6 °C */
  digits: number;
  points: Point[];
  now: number;
  scale: Scale;
  band?: { from: number; to: number; label: string };
  /** Extra line under the big number (e.g. soil moisture status) */
  children?: ReactNode;
}

const TABLE_ROWS = 20;

/** Card for a number sensor: current value + chart (or table) of the recent readings. */
export function MetricCard({ title, icon, color, unit, digits, points, now, scale, band, children }: MetricCardProps) {
  const { t, formatNumber, formatTime } = useI18n();
  const [view, setView] = useState<View>("chart");
  const last = points.at(-1);
  const withUnit = (v: number, d = digits) => `${formatNumber(v, d)} ${unit}`;

  let body: ReactNode;
  if (points.length === 0) {
    body = <WaitingForData />;
  } else if (view === "chart") {
    body = (
      <TrendChart
        points={points}
        now={now}
        color={color}
        scale={scale}
        band={band}
        formatValue={(v) => withUnit(v)}
        formatTick={(v) => formatNumber(v, Number.isInteger(v) ? 0 : 1)}
        label={t("chartLabel", { metric: title, count: points.length })}
      />
    );
  } else {
    const rows = points
      .slice(-TABLE_ROWS)
      .reverse()
      .map((p) => ({ key: p.t, time: formatTime(p.t, true), value: withUnit(p.v) }));
    body = <ReadingsTable rows={rows} valueHeader={title} />;
  }

  return (
    <Card
      title={title}
      icon={icon}
      color={color}
      lastTime={last?.t}
      now={now}
      view={view}
      onToggleView={() => setView(view === "chart" ? "table" : "chart")}
    >
      <CardValue value={last ? formatNumber(last.v, digits) : "–"} unit={unit} stale={isStale(last?.t, now)} />
      {children && <div className="card-sub">{children}</div>}
      <div className="card-body">{body}</div>
    </Card>
  );
}
