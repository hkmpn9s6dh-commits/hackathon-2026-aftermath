/**
 * Pull real citation cascades from OpenAlex.
 *
 *   node scripts/fetch-cascades.mjs
 *
 * For each retracted paper: find it, find its retraction notice, take the
 * most-cited papers that cite it, and keep the citation edges between those
 * papers. Writes one JSON per seed into public/data/.
 *
 * OpenAlex is CC0. Every number in the app can be re-derived by re-running
 * this script; the fetch date is written into each file.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = 'https://api.openalex.org';
const SELECT = 'id,doi,title,publication_year,cited_by_count,referenced_works,type,primary_location,authorships';
const UA = { 'user-agent': 'aftermath-hackathon (mailto:noreply@example.com)' };
const CAP = Number(process.env.CAP ?? 260);

const SEEDS = [
  {
    slug: 'wakefield',
    doi: '10.1016/S0140-6736(97)11096-0',
    noticeDoi: '10.1016/S0140-6736(10)60175-4',
    field: 'medicine',
    story: 'The 1998 paper that started the modern anti-vaccine movement. Retracted in 2010 by the journal that published it.',
  },
  {
    slug: 'lesne',
    doi: '10.1038/nature04533',
    noticeDoi: '10.1038/s41586-024-07341-z',
    field: 'neuroscience',
    story: 'A 2006 Nature paper on amyloid-beta oligomers, retracted in 2024 after an image investigation — two decades of Alzheimer\'s work had already been built on it.',
  },
  {
    slug: 'mehra',
    doi: '10.1016/S0140-6736(20)31180-6',
    noticeDoi: '10.1016/S0140-6736(20)31324-6',
    field: 'medicine',
    story: 'The June 2020 hydroxychloroquine study that paused trials worldwide and was withdrawn 13 days later when the underlying data could not be produced.',
  },
];

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: UA });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

const short = (id) => String(id).split('/').pop();

async function resolveDoi(doi) {
  const work = await get(`/works/https://doi.org/${doi}?select=id,doi,title,publication_year,cited_by_count`);
  return work;
}

function packWork(work) {
  const authors = (work.authorships ?? [])
    .map((entry) => entry.author?.display_name)
    .filter(Boolean)
    .slice(0, 3);
  const journal = work.primary_location?.source?.display_name ?? '';
  return {
    id: short(work.id),
    doi: (work.doi ?? '').replace('https://doi.org/', ''),
    title: (work.title ?? 'Untitled').replace(/\s+/g, ' ').trim(),
    year: work.publication_year ?? null,
    citations: work.cited_by_count ?? 0,
    type: work.type ?? '',
    journal,
    authors,
  };
}

async function cascade(seed) {
  const target = await resolveDoi(seed.doi);
  const notice = await resolveDoi(seed.noticeDoi);
  const noticeId = short(notice.id);
  const seedId = short(target.id);

  // Two slices, because one is not enough to answer both questions:
  // the most-cited citers (how influence flowed) and the most recent ones
  // (whether anyone is still citing it after the notice).
  const works = new Map();
  let totalCiters = 0;
  const slices = [
    { sort: 'cited_by_count:desc', pages: Math.ceil(CAP / 200), label: 'most cited' },
    { sort: 'publication_year:desc', pages: 1, label: 'most recent' },
  ];
  for (const slice of slices) {
    for (let page = 1; page <= slice.pages; page += 1) {
      const data = await get(
        `/works?filter=cites:${seedId}&per-page=200&page=${page}&sort=${slice.sort}&select=${SELECT}`,
      );
      totalCiters = data.meta.count;
      for (const work of data.results) {
        const packed = packWork(work);
        if (works.has(packed.id)) continue;
        works.set(packed.id, {
          ...packed,
          citesNotice: (work.referenced_works ?? []).some((ref) => short(ref) === noticeId),
          refs: (work.referenced_works ?? []).map(short),
        });
      }
      if (data.results.length < 200) break;
    }
  }

  const ids = new Set([...works.keys(), seedId, noticeId]);
  const edges = [];
  for (const work of works.values()) {
    for (const ref of work.refs) {
      if (ref === work.id) continue;
      if (ids.has(ref)) edges.push([work.id, ref]);
    }
    delete work.refs;
  }

  const payload = {
    slug: seed.slug,
    fetched: new Date().toISOString().slice(0, 10),
    source: 'OpenAlex (CC0)',
    field: seed.field,
    story: seed.story,
    seed: { ...packWork(target), id: seedId },
    notice: { ...packWork(notice), id: noticeId },
    totalCiters,
    sampled: works.size,
    sampling: 'the most-cited citers plus the most recent ones',
    works: [...works.values()],
    edges,
  };

  const silent = payload.works.filter((work) => !work.citesNotice).length;
  process.stdout.write(
    `${seed.slug}: ${works.size} of ${totalCiters} citers · ${edges.length} edges · ` +
      `${silent} silent (${Math.round((silent / Math.max(1, works.size)) * 100)}%)\n`,
  );
  return payload;
}

await mkdir(resolve(ROOT, 'public/data'), { recursive: true });
for (const seed of SEEDS) {
  const payload = await cascade(seed);
  await writeFile(resolve(ROOT, 'public/data', `${seed.slug}.json`), JSON.stringify(payload), 'utf8');
}
process.stdout.write('done\n');
