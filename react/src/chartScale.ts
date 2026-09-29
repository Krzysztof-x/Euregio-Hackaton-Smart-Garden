/** Y-axis range of a chart plus the values that get a label + gridline. */
export interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
}

/** Fixed 0-100 % axis for humidity and soil moisture. */
export const PERCENT_SCALE: Scale = { lo: 0, hi: 100, ticks: [0, 50, 100] };

/**
 * Builds a y-axis around the values with clean numbers (e.g. 18, 20, 22, 24).
 * `minSpan` stops tiny changes (21.6 -> 21.7) from looking like huge jumps.
 */
export function niceScale(values: number[], minSpan: number, tickCount = 4): Scale {
  if (values.length === 0) return { lo: 0, hi: minSpan, ticks: [0, minSpan] };

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < minSpan) {
    const middle = (min + max) / 2;
    min = middle - minSpan / 2;
    max = middle + minSpan / 2;
  }

  // Step between ticks: the smallest of 1, 2, 2.5, 5, 10 (x 10^n) that is big enough
  const rawStep = (max - min) / (tickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;

  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}
