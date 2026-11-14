/**
 * Aftermath — the app is one loop: load a real cascade into the graph, draw
 * it, and answer "how is this paper connected to the retraction, and did it
 * ever mention it" for whichever paper you click.
 */

import './styles.css';
import { openDb, type Db } from './db';
import { loadCascade, loadSeedFile, toWorks } from './data';
import { layoutCascade, type CascadeLayout } from './cascade';
import { renderCascade } from './render';
import { byYear, citedWithin, loudestSilence, pathToSeed, stats, workById } from './queries';
import type { Cascade, Work } from './types';

const SEEDS = [
  { slug: 'wakefield', who: 'Wakefield', what: 'MMR and autism · 1998, retracted 2010' },
  { slug: 'lesne', who: 'Lesné', what: 'amyloid-β oligomers · 2006, retracted 2024' },
  { slug: 'mehra', who: 'Mehra', what: 'hydroxychloroquine · 2020, withdrawn 13 days later' },
];

const el = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
};

const chartEl = el<HTMLDivElement>('#chart');
const claimEl = el<HTMLDivElement>('#claim');
const seedsEl = el<HTMLElement>('#seeds');
const storyEl = el<HTMLParagraphElement>('#story');
const cardEl = el<HTMLElement>('#card');
const rankEl = el<HTMLOListElement>('#rank');
const queryBox = el<HTMLDetailsElement>('#query');
const cypherEl = el<HTMLElement>('#cypher');
const queryMeta = el<HTMLParagraphElement>('#query-meta');

let db: Db | null = null;
let cascade: Cascade | null = null;
let layout: CascadeLayout | null = null;
let selected: string | null = null;
let path: string[] = [];

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (n: number): string => n.toLocaleString('en-US');

function paintSeeds(active: string): void {
  seedsEl.innerHTML = SEEDS.map(
    (seed) => `<button type="button" class="seed${seed.slug === active ? ' on' : ''}" data-seed="${seed.slug}">
        <b>${esc(seed.who)}</b><span>${esc(seed.what)}</span>
      </button>`,
  ).join('');
}

function paintClaim(): void {
  if (!cascade) return;
  const facts = stats(db as Db);
  const noticeYear = cascade.notice.year ?? 0;
  claimEl.innerHTML = `
    <p class="line"><b>${fmt(cascade.totalCiters)}</b> papers cite the retracted article. The graph below holds the ${fmt(facts.sampled)} most cited and most recent of them.</p>
    <p class="line"><b class="red">${fmt(facts.silent)}</b> of the <b>${fmt(facts.after)}</b> published after the ${noticeYear} retraction still never cite it.</p>`;
}

function paintRank(): void {
  const top = loudestSilence(db as Db, 5);
  rankEl.innerHTML = top
    .map(
      (work, index) => `<li>
        <button type="button" data-pick="${esc(work.id)}">
          <span class="num">${index + 1}</span>
          <span class="text"><b>${esc(shorten(work.title, 92))}</b><em>${work.year ?? '—'} · ${esc(work.journal || 'journal not indexed')} · ${fmt(work.citations)} citations</em></span>
        </button>
      </li>`,
    )
    .join('');
}

const shorten = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function paintCard(work: Work): void {
  const hops = path.length > 0 ? path.length - 1 : 0;
  const cited = citedWithin(db as Db, work.id);
  const verdict = work.silent
    ? 'builds on the retracted paper and never cites the retraction'
    : work.citesNotice
      ? 'cites the retraction'
      : work.predates
        ? 'was published before the retraction existed'
        : 'cites the retracted paper';
  const chain =
    path.length > 1
      ? path
          .map((id) => {
            if (id === work.id) return `<b>this paper</b>`;
            if (id === cascade?.seed.id) return '<b>the retracted paper</b>';
            const step = layout?.placed.get(id)?.work;
            return step ? esc(shorten(step.title, 46)) : esc(id);
          })
          .join(' <span class="arrow">→</span> ')
      : '';

  cardEl.innerHTML = `
    <p class="kicker">${work.silent ? '<span class="tag red">silent</span>' : work.citesNotice ? '<span class="tag">acknowledges</span>' : work.predates ? '<span class="tag faded">predates</span>' : '<span class="tag">linked</span>'} ${hops === 1 ? '1 hop' : `${hops} hops`} from the retraction</p>
    <h2>${esc(work.title)}</h2>
    <p class="byline">${work.year ?? '—'} · ${esc(work.journal || 'journal not indexed')}${work.authors ? ` · ${esc(work.authors)}` : ''}</p>
    <p class="verdict">This paper ${esc(verdict)}.</p>
    <dl class="facts">
      <div><dt>its own citations</dt><dd>${fmt(work.citations)}</dd></div>
      <div><dt>papers here that cite it</dt><dd>${fmt(cited)}</dd></div>
      <div><dt>hops to the retraction</dt><dd>${hops}</dd></div>
    </dl>
    ${chain ? `<p class="chain">${chain}</p>` : ''}
    ${work.doi ? `<p class="doi"><a href="https://doi.org/${esc(work.doi)}" target="_blank" rel="noreferrer">doi.org/${esc(work.doi)}</a></p>` : ''}`;
}

function paintQuery(cypher: string, note: string): void {
  queryBox.hidden = false;
  cypherEl.textContent = cypher;
  queryMeta.textContent = note;
}

function draw(): void {
  if (!layout) return;
  renderCascade(chartEl, {
    layout,
    edges: cascade?.edges ?? [],
    selected,
    path,
    noticeYear: cascade?.notice.year ?? null,
  });
}

async function openSeed(slug: string): Promise<void> {
  if (!db) return;
  paintSeeds(slug);
  const loaded = await loadSeedFile(slug);
  cascade = loaded;
  loadCascade(db, loaded);
  layout = layoutCascade(toWorks(loaded));
  selected = null;
  path = [];
  paintClaim();
  paintRank();
  storyEl.innerHTML = `<b>${esc(SEEDS.find((seed) => seed.slug === slug)?.who ?? slug)}</b> — ${esc(loaded.story)} <span class="source">${fmt(loaded.totalCiters)} citing papers in OpenAlex on ${loaded.fetched}.</span>`;
  cardEl.innerHTML = `<p class="hint">Click any dot. Every paper here is a real one, and every edge a real citation.</p>`;
  queryBox.hidden = true;
  draw();

  // open on the loudest silence: the picture and the proof of it, together
  const first = loudestSilence(db, 1)[0];
  if (first) pick(first.id);
}

function pick(id: string): void {
  if (!db) return;
  selected = id;
  const work = workById(db, id);
  const found = pathToSeed(db, id);
  path = found?.ids ?? [];
  if (work) paintCard(work);
  draw();
  paintQuery(
    `MATCH (w:Work {id: $id}) MATCH (s:Work {role: 'seed'})
MATCH p = shortestPath((w)-[:CITES*1..6]->(s))
RETURN [n IN nodes(p) | n.title] AS chain, length(p) AS hops`,
    `${found?.hops ?? 0} hops · ${workById(db, id)?.silent ? 'silent' : 'linked'} · in-process WebAssembly, no network`,
  );
  void byYear;
}

async function boot(): Promise<void> {
  db = await openDb();
  seedsEl.addEventListener('click', (event) => {
    const slug = (event.target as Element).closest('button')?.getAttribute('data-seed');
    if (slug) void openSeed(slug);
  });
  chartEl.addEventListener('click', (event) => {
    const id = (event.target as Element).closest('.work')?.getAttribute('data-id');
    if (id) pick(id);
  });
  rankEl.addEventListener('click', (event) => {
    const id = (event.target as Element).closest('button')?.getAttribute('data-pick');
    if (id) {
      pick(id);
      chartEl.querySelector(`.work[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  await openSeed('wakefield');
}

void boot();
