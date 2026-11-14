import { describe, expect, it } from 'vitest';

import wakefield from '../public/data/wakefield.json';
import lesne from '../public/data/lesne.json';
import { layoutCascade } from '../src/cascade';
import { toWorks } from '../src/data';
import type { Cascade } from '../src/types';

const cascade = wakefield as unknown as Cascade;
const works = toWorks(cascade);

describe('laying the cascade out', () => {
  const layout = layoutCascade(works);

  it('places every paper once', () => {
    expect(layout.placed.size).toBe(new Set(works.map((work) => work.id)).size);
  });

  it('puts later papers further right', () => {
    const early = layout.placed.get(cascade.seed.id);
    const late = [...layout.placed.values()].find((spot) => (spot.work.year ?? 0) > 2020);
    expect(early).toBeDefined();
    expect(late).toBeDefined();
    expect((late as { x: number }).x).toBeGreaterThan((early as { x: number }).x);
  });

  it('puts more-cited papers higher', () => {
    const sorted = [...layout.placed.values()].sort((a, b) => b.work.citations - a.work.citations);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    expect((top as { y: number }).y).toBeLessThan((bottom as { y: number }).y);
  });

  it('keeps every paper inside the plate', () => {
    for (const spot of layout.placed.values()) {
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(layout.height);
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(layout.width);
    }
  });

  it('draws a log axis with one tick per decade', () => {
    expect(layout.ticks.length).toBeGreaterThanOrEqual(3);
    expect(layout.ticks[0]?.value).toBe(1);
  });

  it('covers the years the papers actually span', () => {
    expect(layout.years.min).toBeLessThanOrEqual(1998);
    expect(layout.years.max).toBeGreaterThanOrEqual(2024);
  });
});

describe('the second case file', () => {
  it('flags papers as silent only after the 2024 retraction', () => {
    const other = lesne as unknown as Cascade;
    const rows = toWorks(other);
    const silent = rows.filter((row) => row.silent);
    expect(silent.length).toBeGreaterThan(50);
    expect(silent.every((row) => (row.year ?? 0) >= (other.notice.year as number))).toBe(true);
  });
});
