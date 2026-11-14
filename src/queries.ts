/**
 * Every question the app asks the graph.
 *
 * The pattern behind all of them: a citation is an edge, so "how far did this
 * retraction travel" is reachability, and "who is still building on it" is a
 * set difference over that reachability. Neither is a table lookup.
 */

import type { Db, Row } from './db';
import type { Work } from './types';

const num = (row: Row, key: string): number => Number(row[key] ?? 0);
const str = (row: Row, key: string): string => String(row[key] ?? '');

export interface Stats {
  sampled: number;
  silent: number;
  predates: number;
  acknowledged: number;
  after: number;
  hubs: number;
}

export function stats(db: Db): Stats {
  const row = db.run(`MATCH (w:Work) WHERE w.role = ''
RETURN count(w) AS sampled,
       sum(CASE WHEN w.silent THEN 1 ELSE 0 END) AS silent,
       sum(CASE WHEN w.predates THEN 1 ELSE 0 END) AS predates,
       sum(CASE WHEN NOT w.silent AND NOT w.predates THEN 1 ELSE 0 END) AS acknowledged`).rows[0] ?? {};
  const sampled = num(row, 'sampled');
  const predates = num(row, 'predates');
  return {
    sampled,
    silent: num(row, 'silent'),
    predates,
    acknowledged: num(row, 'acknowledged'),
    after: sampled - predates,
    hubs: 0,
  };
}

/** The silent papers that carry the most weight, by their own citation count. */
export function loudestSilence(db: Db, limit = 6): Work[] {
  return db
    .run(
      `MATCH (w:Work) WHERE w.silent
RETURN w.id AS id, w.title AS title, w.year AS year, w.citations AS citations, w.journal AS journal, w.authors AS authors
ORDER BY w.citations DESC LIMIT $limit`,
      { limit },
    )
    .rows.map((row) => ({
      id: str(row, 'id'),
      title: str(row, 'title'),
      year: row['year'] === null ? null : num(row, 'year'),
      citations: num(row, 'citations'),
      journal: str(row, 'journal'),
      authors: str(row, 'authors'),
      doi: '',
      role: '',
      citesNotice: false,
      silent: true,
      predates: false,
    }));
}

export interface YearRow {
  year: number;
  total: number;
  silent: number;
}

export function byYear(db: Db): YearRow[] {
  return db
    .run(`MATCH (w:Work) WHERE w.role = '' AND w.year IS NOT NULL
RETURN w.year AS year, count(w) AS total, sum(CASE WHEN w.silent THEN 1 ELSE 0 END) AS silent
ORDER BY year`)
    .rows.map((row) => ({ year: num(row, 'year'), total: num(row, 'total'), silent: num(row, 'silent') }));
}

export interface PathResult {
  ids: string[];
  titles: string[];
  hops: number;
}

/** How this paper reaches the retracted one — the chain a judge can check. */
export function pathToSeed(db: Db, id: string): PathResult | null {
  const row = db
    .run(
      `MATCH (w:Work {id: $id}) MATCH (s:Work {role: 'seed'})
MATCH p = shortestPath((w)-[:CITES*1..6]->(s))
RETURN [n IN nodes(p) | n.id] AS ids, [n IN nodes(p) | n.title] AS titles, length(p) AS hops`,
      { id },
    )
    .rows[0];
  if (!row) return null;
  const ids = (row['ids'] as unknown[]) ?? [];
  return {
    ids: ids.map(String),
    titles: ((row['titles'] as unknown[]) ?? []).map(String),
    hops: num(row, 'hops'),
  };
}

/** How many sampled papers cite this one — weight inside the cascade. */
export function citedWithin(db: Db, id: string): number {
  const row = db.run('MATCH (w:Work {id: $id})<-[:CITES]-(other:Work) RETURN count(other) AS n', { id }).rows[0];
  return num(row ?? {}, 'n');
}

export function workById(db: Db, id: string): Work | null {
  const row = db
    .run(
      `MATCH (w:Work {id: $id})
RETURN w.id AS id, w.title AS title, w.year AS year, w.citations AS citations, w.journal AS journal,
       w.authors AS authors, w.doi AS doi, w.role AS role, w.citesNotice AS citesNotice,
       w.silent AS silent, w.predates AS predates`,
      { id },
    )
    .rows[0];
  if (!row) return null;
  return {
    id: str(row, 'id'),
    title: str(row, 'title'),
    year: row['year'] === null ? null : num(row, 'year'),
    citations: num(row, 'citations'),
    journal: str(row, 'journal'),
    authors: str(row, 'authors'),
    doi: str(row, 'doi'),
    role: (str(row, 'role') as Work['role']) || '',
    citesNotice: Boolean(row['citesNotice']),
    silent: Boolean(row['silent']),
    predates: Boolean(row['predates']),
  };
}

export function allWorks(db: Db): Work[] {
  return db
    .run('MATCH (w:Work) RETURN w.id AS id, w.title AS title, w.year AS year, w.citations AS citations, w.journal AS journal, w.authors AS authors, w.doi AS doi, w.role AS role, w.citesNotice AS citesNotice, w.silent AS silent, w.predates AS predates')
    .rows.map((row) => ({
      id: str(row, 'id'),
      title: str(row, 'title'),
      year: row['year'] === null ? null : num(row, 'year'),
      citations: num(row, 'citations'),
      journal: str(row, 'journal'),
      authors: str(row, 'authors'),
      doi: str(row, 'doi'),
      role: (str(row, 'role') as Work['role']) || '',
      citesNotice: Boolean(row['citesNotice']),
      silent: Boolean(row['silent']),
      predates: Boolean(row['predates']),
    }));
}
