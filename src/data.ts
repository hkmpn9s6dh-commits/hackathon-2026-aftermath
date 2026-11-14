/**
 * Loading a cascade into the graph.
 *
 * The file is a snapshot of OpenAlex taken on the fetch date; nothing is
 * fetched at run time. "Silent" is not stored in the file — it is derived
 * here from three facts: it cites the paper, it does not cite the retraction,
 * and it was published after the retraction existed.
 */

import type { Db } from './db';
import type { Cascade, Work } from './types';

export function toWorks(cascade: Cascade): Work[] {
  const noticeYear = cascade.notice.year ?? 9999;
  const rows: Work[] = [
    {
      ...cascade.seed,
      authors: cascade.seed.authors.join(', '),
      role: 'seed',
      citesNotice: false,
      silent: false,
      predates: false,
    },
    {
      ...cascade.notice,
      authors: cascade.notice.authors.join(', '),
      role: 'notice',
      citesNotice: false,
      silent: false,
      predates: false,
    },
  ];
  for (const work of cascade.works) {
    rows.push({
      ...work,
      authors: work.authors.join(', '),
      role: '',
      citesNotice: work.citesNotice,
      silent: !work.citesNotice && (work.year ?? 0) >= noticeYear,
      predates: (work.year ?? 0) < noticeYear,
    });
  }
  return rows;
}

export function loadCascade(db: Db, cascade: Cascade): void {
  db.run('MATCH (n:Work) DETACH DELETE n');
  const works = toWorks(cascade);

  for (let i = 0; i < works.length; i += 300) {
    db.run(
      `UNWIND $rows AS r CREATE (:Work {id: r.id, title: r.title, year: r.year, citations: r.citations,
        journal: r.journal, doi: r.doi, authors: r.authors, role: r.role, citesNotice: r.citesNotice,
        silent: r.silent, predates: r.predates})`,
      { rows: works.slice(i, i + 300) },
    );
  }

  for (let i = 0; i < cascade.edges.length; i += 400) {
    db.run(
      `UNWIND $rows AS r MATCH (a:Work {id: r.from}), (b:Work {id: r.to}) CREATE (a)-[:CITES]->(b)`,
      { rows: cascade.edges.slice(i, i + 400).map(([from, to]) => ({ from, to })) },
    );
  }
}

export async function loadSeedFile(slug: string): Promise<Cascade> {
  const response = await fetch(`./data/${slug}.json`);
  if (!response.ok) throw new Error(`no cascade named ${slug}`);
  return (await response.json()) as Cascade;
}
