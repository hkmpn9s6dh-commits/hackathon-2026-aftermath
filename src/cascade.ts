/**
 * The cascade, as a field rather than a flow chart.
 *
 * Every paper in the sample cites the retracted one, so "hops from the
 * retraction" is one for almost all of them — a useless vertical axis. What
 * actually separates them is *reach*: how much the paper is itself cited.
 * So the picture is time across, influence up, and whether it ever mentioned
 * the retraction decides the colour.
 */

import type { Work } from './types';

export const PAD_LEFT = 92;
export const PAD_TOP = 46;
export const PAD_BOTTOM = 58;
export const WIDTH = 1420;
export const HEIGHT = 640;

export interface Placed {
  work: Work;
  x: number;
  y: number;
  r: number;
}

export interface CascadeLayout {
  placed: Map<string, Placed>;
  width: number;
  height: number;
  years: { min: number; max: number };
  /** powers of ten for the vertical axis, with their y positions */
  ticks: Array<{ value: number; y: number }>;
}

export function layoutCascade(works: Work[]): CascadeLayout {
  const years = works.map((work) => work.year).filter((year): year is number => typeof year === 'number');
  const min = years.length > 0 ? Math.min(...years) : 2000;
  const max = Math.max(years.length > 0 ? Math.max(...years) : min + 1, min + 1);
  const span = Math.max(1, max - min);

  const counts = works.map((work) => Math.max(0, work.citations)).sort((a, b) => a - b);
  const p5 = counts[Math.floor(counts.length * 0.05)] ?? 0;
  const floor = Math.max(0, p5 * 0.85);
  const peak = Math.max(floor + 10, counts[counts.length - 1] ?? 10);
  const top = PAD_TOP;
  const bottom = HEIGHT - PAD_BOTTOM;

  const xOf = (year: number | null): number =>
    PAD_LEFT + (((year ?? min) - min) / span) * (WIDTH - PAD_LEFT - 60);
  const lowLog = Math.log10(floor + 1);
  const highLog = Math.log10(peak + 1);
  const yOf = (citations: number): number =>
    bottom - ((Math.log10(Math.max(0, citations) + 1) - lowLog) / Math.max(0.0001, highLog - lowLog)) * (bottom - top);

  const placed = new Map<string, Placed>();
  const perYear = new Map<number, number>();
  for (const work of works) {
    const year = work.year ?? min;
    const index = perYear.get(year) ?? 0;
    perYear.set(year, index + 1);
    // a small fan inside each year so papers of equal reach do not sit on one point
    const step = Math.ceil(Math.min(index, 7) / 2) * (index % 2 === 1 ? 1 : -1) * 3.4;
    const clamped = Math.max(floor, work.citations);
    const y = Math.max(PAD_TOP - 6, Math.min(bottom + 6, yOf(clamped) + step));
    placed.set(work.id, {
      work,
      x: xOf(year),
      y,
      r: 2.6 + Math.min(4.6, Math.sqrt(Math.max(0, work.citations)) / 9),
    });
  }

  const ticks: Array<{ value: number; y: number }> = [];
  for (let power = Math.floor(lowLog); power <= Math.ceil(highLog); power += 1) {
    const value = 10 ** power;
    if (value < floor || value > peak) continue;
    ticks.push({ value, y: yOf(value) });
  }

  return { placed, width: WIDTH, height: HEIGHT, years: { min, max }, ticks };
}
