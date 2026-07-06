/**
 * Generates human-friendly tick marks for a numeric plot axis.
 *
 * Produces evenly spaced ticks at "nice" round intervals (multiples of 1, 2, 5
 * times a power of ten) covering the `[min, max]` range, so axis labels read as
 * 0.2, 0.4, … rather than arbitrary fractions.
 *
 * @param min - Lower bound of the data range.
 * @param max - Upper bound of the data range.
 * @param count - Approximate number of ticks to aim for (default 5).
 * @returns The tick positions in ascending order. Returns `[min]` when the range
 *   is degenerate (non-finite or zero-width).
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const niceStep = mult * step;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + niceStep * 1e-6; v += niceStep) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}
