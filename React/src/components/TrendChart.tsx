import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Scale } from "../chartScale";
import { CHART_GAP_MS } from "../config";
import { useElementWidth } from "../hooks/useElementWidth";
import type { Point } from "../hooks/useGardenData";
import { useI18n } from "../i18n/context";

export const CHART_HEIGHT = 168;
const MARGIN = { top: 10, right: 10, bottom: 26, left: 38 };

interface TrendChartProps {
  points: Point[];
  now: number;
  /** CSS color of the line, e.g. "var(--series-temperature)" */
  color: string;
  scale: Scale;
  /** Optional shaded range, e.g. the "good" soil moisture zone */
  band?: { from: number; to: number; label: string };
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  /** Description for screen readers */
  label: string;
}

/** Splits the readings where the sensor was offline, so the line doesn't bridge the gap. */
function splitOnGaps(points: Point[]): Point[][] {
  const segments: Point[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (current && previous && point.t - previous.t <= CHART_GAP_MS) current.push(point);
    else segments.push([point]);
  }
  return segments;
}

/** Index of the reading closest to time `t` (readings are sorted by time). */
function nearestIndex(points: Point[], t: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - points[lo - 1].t < points[lo].t - t) lo -= 1;
  return lo;
}

/** Line chart of one sensor over time, with hover / keyboard crosshair. */
export function TrendChart({ points, now, color, scale, band, formatValue, formatTick, label }: TrendChartProps) {
  const { formatTime } = useI18n();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const segments = useMemo(() => splitOnGaps(points), [points]);

  // Time axis: first reading -> now (at least 1 minute wide)
  const end = Math.max(now, points.at(-1)?.t ?? now);
  const start = Math.min(points[0]?.t ?? end, end - 60_000);

  // Converting data values to pixel positions
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (t: number) => MARGIN.left + ((t - start) / (end - start)) * plotWidth;
  const y = (v: number) => {
    const clamped = Math.min(scale.hi, Math.max(scale.lo, v));
    return MARGIN.top + (1 - (clamped - scale.lo) / (scale.hi - scale.lo)) * plotHeight;
  };
  const baseline = y(scale.lo);
  const linePath = (seg: Point[]) =>
    seg.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const areaPath = (seg: Point[]) =>
    `${linePath(seg)}L${x(seg[seg.length - 1].t).toFixed(1)},${baseline}L${x(seg[0].t).toFixed(1)},${baseline}Z`;

  // A filled area only makes sense when the axis starts at 0 (otherwise it suggests a false amount)
  const showArea = scale.lo === 0;
  const hovered = hoverTime !== null && points.length > 0 ? points[nearestIndex(points, hoverTime)] : null;
  const marker = hovered ?? points.at(-1);
  const showSeconds = end - start < 10 * 60_000;
  const timeTicks = [
    { t: start, anchor: "start" },
    { t: (start + end) / 2, anchor: "middle" },
    { t: end, anchor: "end" },
  ] as const;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (points.length === 0 || plotWidth <= 0) return;
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setHoverTime(start + ((px - MARGIN.left) / plotWidth) * (end - start));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const lastIndex = points.length - 1;
    const current = hoverTime === null ? lastIndex : nearestIndex(points, hoverTime);
    const targets: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: lastIndex };
    if (!(event.key in targets)) return;
    event.preventDefault();
    setHoverTime(points[Math.min(lastIndex, Math.max(0, targets[event.key]))].t);
  }

  return (
    <div
      ref={ref}
      className="chart"
      tabIndex={0}
      role="group"
      aria-label={label}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverTime(null)}
      onFocus={() => setHoverTime(points.at(-1)?.t ?? null)}
      onBlur={() => setHoverTime(null)}
      onKeyDown={handleKeyDown}
    >
      {width > 0 && (
        <svg width={width} height={CHART_HEIGHT} aria-hidden="true">
          {band && (
            <g>
              <rect
                className="chart-band"
                x={MARGIN.left}
                y={y(band.to)}
                width={plotWidth}
                height={y(band.from) - y(band.to)}
              />
              <text className="chart-band-label" x={MARGIN.left + plotWidth - 6} y={y(band.to) + 14} textAnchor="end">
                {band.label}
              </text>
            </g>
          )}

          {/* Horizontal gridlines + y-axis labels */}
          {scale.ticks.map((v) => (
            <g key={v}>
              <line
                className={v === scale.lo ? "chart-baseline" : "chart-grid"}
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(v)}
                y2={y(v)}
              />
              <text className="chart-tick" x={MARGIN.left - 8} y={y(v)} dy="0.32em" textAnchor="end">
                {formatTick(v)}
              </text>
            </g>
          ))}

          {/* Time labels under the chart */}
          {timeTicks.map(({ t, anchor }) => (
            <text key={anchor} className="chart-tick" x={x(t)} y={CHART_HEIGHT - 6} textAnchor={anchor}>
              {formatTime(t, showSeconds)}
            </text>
          ))}

          {/* The data: soft area + line per connected segment, a dot for lone readings */}
          {segments.map((seg) =>
            seg.length > 1 ? (
              <g key={seg[0].t}>
                {showArea && <path d={areaPath(seg)} style={{ fill: color }} fillOpacity={0.1} />}
                <path className="chart-line" d={linePath(seg)} style={{ stroke: color }} />
              </g>
            ) : (
              <circle key={seg[0].t} cx={x(seg[0].t)} cy={y(seg[0].v)} r={2.5} style={{ fill: color }} />
            ),
          )}

          {hovered && (
            <line className="chart-crosshair" x1={x(hovered.t)} x2={x(hovered.t)} y1={MARGIN.top} y2={baseline} />
          )}
          {marker && <circle className="chart-dot" cx={x(marker.t)} cy={y(marker.v)} r={4.5} style={{ fill: color }} />}
        </svg>
      )}

      {hovered && (
        <div
          className="chart-tip"
          data-side={x(hovered.t) > width / 2 ? "left" : "right"}
          style={{ left: x(hovered.t), top: y(hovered.v) }}
          aria-live="polite"
        >
          <strong>{formatValue(hovered.v)}</strong>
          <span>{formatTime(hovered.t, true)}</span>
        </div>
      )}
    </div>
  );
}
