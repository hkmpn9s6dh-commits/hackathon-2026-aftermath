import { beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '../src/db';
import type { Cascade } from '../src/types';
import { loadCascade, toWorks } from '../src/data';
import { allWorks, byYear, citedWithin, loudestSilence, pathToSeed, stats } from '../src/queries';
import { nodeDb } from './harness';

import wakefield from '../public/data/wakefield.json';

const cascade = wakefield as unknown as Cascade;

let db: Db;

beforeAll(() => {
  db = nodeDb();
  loadCascade(db, cascade);
});

describe('the graph holds the cascade', () => {
  it('has every sampled paper plus the paper and the notice', () => {
    expect(allWorks(db)).toHaveLength(cascade.works.length + 2);
  });

  it('marks exactly one seed and one notice', () => {
    const works = allWorks(db);
    expect(works.filter((w) => w.role === 'seed')).toHaveLength(1);
    expect(works.filter((w) => w.role === 'notice')).toHaveLength(1);
  });
});

describe('silence is derived, not stored', () => {
  it('counts only papers published after the retraction', () => {
    const works = toWorks(cascade);
    const noticeYear = cascade.notice.year as number;
    const silent = works.filter((work) => work.silent);
    expect(silent.every((work) => (work.year ?? 0) >= noticeYear)).toBe(true);
    expect(silent.every((work) => !work.citesNotice)).toBe(true);
  });

  it('never calls a paper silent if it cites the notice', () => {
    const aware = cascade.works.filter((work) => work.citesNotice);
    expect(aware.length).toBeGreaterThan(0);
    const silent = toWorks(cascade).filter((work) => work.silent).map((work) => work.id);
    expect(aware.some((work) => silent.includes(work.id))).toBe(false);
  });

  it('never calls a paper silent if it predates the retraction', () => {
    const works = toWorks(cascade).filter((work) => work.predates);
    expect(works.length).toBeGreaterThan(0);
    expect(works.every((work) => !work.silent)).toBe(true);
  });

  it('adds up: acknowledged + silent = everything after the notice', () => {
    const facts = stats(db);
    expect(facts.acknowledged + facts.silent).toBe(facts.after);
    expect(facts.after + facts.predates).toBe(facts.sampled);
  });

  it('agrees with the file it was built from', () => {
    const facts = stats(db);
    expect(facts.sampled).toBe(cascade.works.length);
    const silent = toWorks(cascade).filter((work) => work.silent).length;
    expect(facts.silent).toBe(silent);
  });
});

describe('the questions the app asks', () => {
  it('finds the loudest silent papers', () => {
    const top = loudestSilence(db, 5);
    expect(top).toHaveLength(5);
    expect(top.every((work) => work.silent)).toBe(true);
    expect(top[0]?.citations).toBeGreaterThan(top[4]?.citations ?? 0);
  });

  it('walks a silent paper back to the retraction', () => {
    const target = loudestSilence(db, 1)[0];
    expect(target).toBeDefined();
    const path = pathToSeed(db, target?.id as string);
    expect(path).not.toBeNull();
    expect(path?.hops).toBeGreaterThanOrEqual(1);
    expect(path?.ids).toHaveLength((path?.hops ?? 0) + 1);
    expect(path?.ids[path?.ids.length - 1]).toBe(cascade.seed.id);
  });

  it('counts who cites a paper inside the sample', () => {
    const seedCited = citedWithin(db, cascade.seed.id);
    expect(seedCited).toBeGreaterThan(100);
  });

  it('groups by year', () => {
    const rows = byYear(db);
    expect(rows.length).toBeGreaterThan(10);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    expect(total).toBe(cascade.works.length);
    expect(rows.every((row) => row.silent <= row.total)).toBe(true);
  });
});
